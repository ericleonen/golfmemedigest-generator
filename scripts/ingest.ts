/**
 * Builds the @golfmemedigest style corpus.
 *
 *   npm run ingest                          # read corpus/images/**
 *   npm run ingest -- --limit 25            # only the first 25 new files
 *   npm run ingest -- --concurrency 6
 *   npm run ingest -- --instagram-export ~/Downloads/instagram-export
 *   npm run ingest -- --rebuild             # re-read files already ingested
 *
 * Each image is read once by Claude, which pulls out the text on the meme, the
 * layout, what the photo shows and the comedic device. The result is appended
 * to data/corpus.json, keyed by file hash, so re-running only costs money for
 * images that are new.
 */
import "./env"; // must stay first: populates process.env before config reads it
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";
import { config } from "../lib/config";
import type { Corpus, CorpusMeme, MemeLayout } from "@/shared/types";

const IMAGE_EXTENSIONS = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

/** The Claude API rejects base64 images over 5 MB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ExtractionSchema = z.object({
  isMeme: z
    .boolean()
    .describe(
      "False if this image carries no meme text at all (a plain photo, a logo, a screenshot of something else).",
    ),
  memeText: z
    .string()
    .describe(
      "Every word of text that appears on the image, verbatim, in reading order, with a newline between separate blocks. Empty string if there is none.",
    ),
  layout: z
    .enum(["top-bottom", "caption-bar", "lower-third", "other"])
    .describe(
      "top-bottom = Impact caps at the top and bottom of the photo. caption-bar = a sentence in a bar above or below the photo. lower-third = one line across the bottom only. other = anything else, including tweet screenshots.",
    ),
  imageDescription: z
    .string()
    .describe(
      "One or two sentences on what the photo itself shows, ignoring the text.",
    ),
  device: z
    .string()
    .describe(
      "The comedic device in under 15 words: relatable pain, self-own, delusional confidence, pro-golf callout, equipment cope, and so on.",
    ),
  topics: z
    .array(z.string())
    .describe("2 to 5 short topic tags, e.g. 'slow play', 'shanks', 'range'."),
});

interface Args {
  imagesDir: string;
  captionsFile: string;
  instagramExport: string | null;
  limit: number;
  concurrency: number;
  rebuild: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    imagesDir: "corpus/images",
    captionsFile: "corpus/captions.json",
    instagramExport: null,
    limit: Infinity,
    concurrency: 4,
    rebuild: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--images":
        args.imagesDir = value!;
        i++;
        break;
      case "--captions":
        args.captionsFile = value!;
        i++;
        break;
      case "--instagram-export":
        args.instagramExport = value!;
        i++;
        break;
      case "--limit":
        args.limit = Number(value);
        i++;
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, Number(value) || 4);
        i++;
        break;
      case "--rebuild":
        args.rebuild = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        if (flag?.startsWith("--")) {
          console.warn(`Ignoring unknown flag ${flag}`);
        }
    }
  }
  return args;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Reads captions out of an Instagram data export (Settings -> Your activity ->
 * Download your information, in JSON). Returns a map of media path -> caption,
 * plus the list of media files the export references.
 */
function readInstagramExport(root: string): {
  captions: Map<string, string>;
  images: string[];
} {
  const captions = new Map<string, string>();
  const images: string[] = [];

  const candidates = [
    path.join(root, "your_instagram_activity", "media"),
    path.join(root, "content"),
    root,
  ];

  const postFiles: string[] = [];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (/^posts_\d+\.json$/.test(entry)) postFiles.push(path.join(dir, entry));
    }
  }

  if (postFiles.length === 0) {
    console.warn(
      `No posts_*.json found under ${root}. Point --instagram-export at the folder that contains your_instagram_activity/.`,
    );
    return { captions, images };
  }

  for (const file of postFiles) {
    let posts: unknown;
    try {
      posts = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      console.warn(`Skipping unreadable ${file}: ${err}`);
      continue;
    }
    const list = Array.isArray(posts)
      ? posts
      : ((posts as { media?: unknown[] })?.media ?? []);

    for (const post of list as Array<Record<string, unknown>>) {
      const postCaption =
        typeof post.title === "string" && post.title ? post.title : "";
      const media = Array.isArray(post.media)
        ? (post.media as Array<Record<string, unknown>>)
        : [];
      for (const item of media) {
        const uri = typeof item.uri === "string" ? item.uri : null;
        if (!uri) continue;
        const ext = path.extname(uri).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;
        const abs = path.resolve(root, uri);
        if (!fs.existsSync(abs)) continue;
        const caption =
          (typeof item.title === "string" && item.title) || postCaption;
        images.push(abs);
        if (caption) captions.set(abs, caption);
      }
    }
  }

  return { captions, images: [...new Set(images)].sort() };
}

function loadExistingCorpus(file: string): Corpus {
  if (!fs.existsSync(file)) return { generatedAt: "", memes: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Corpus;
    return { generatedAt: parsed.generatedAt ?? "", memes: parsed.memes ?? [] };
  } catch {
    console.warn(`${file} was unreadable, starting a fresh corpus.`);
    return { generatedAt: "", memes: [] };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

const client = new Anthropic();

async function extract(
  file: string,
  instagramCaption: string | undefined,
): Promise<CorpusMeme | null> {
  const bytes = fs.readFileSync(file);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    console.warn(
      `skip ${path.basename(file)} — ${(bytes.byteLength / 1024 / 1024).toFixed(
        1,
      )} MB is over the 5 MB API limit, resize it first`,
    );
    return null;
  }

  const mediaType = IMAGE_EXTENSIONS.get(path.extname(file).toLowerCase())!;
  const hash = crypto.createHash("sha1").update(bytes).digest("hex");

  const response = await client.messages.parse({
    model: config.model,
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: zodOutputFormat(ExtractionSchema),
    },
    system:
      "You are cataloguing the back catalogue of a golf meme account so another model can learn its voice. Transcribe and describe exactly what you see. Do not invent text that is not on the image.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg",
              data: bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Catalogue this meme from the account's archive.",
          },
        ],
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    console.warn(`skip ${path.basename(file)} — no parsable output`);
    return null;
  }
  if (!parsed.isMeme || !parsed.memeText.trim()) {
    console.warn(`skip ${path.basename(file)} — no meme text found`);
    return null;
  }

  return {
    id: hash,
    source: path.basename(file),
    memeText: parsed.memeText.trim(),
    layout: parsed.layout as MemeLayout | "other",
    imageDescription: parsed.imageDescription,
    device: parsed.device,
    topics: parsed.topics,
    ...(instagramCaption ? { instagramCaption } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusFile = path.resolve(config.corpusPath);

  const captions = new Map<string, string>();
  let files: string[] = walk(args.imagesDir);

  if (args.instagramExport) {
    const exported = readInstagramExport(path.resolve(args.instagramExport));
    for (const [key, value] of exported.captions) captions.set(key, value);
    files = [...new Set([...files, ...exported.images])];
    console.log(
      `Instagram export: ${exported.images.length} images, ${exported.captions.size} captions`,
    );
  }

  if (fs.existsSync(args.captionsFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(args.captionsFile, "utf8")) as Record<
        string,
        string
      >;
      for (const [name, caption] of Object.entries(raw)) {
        captions.set(path.resolve(args.imagesDir, name), caption);
      }
      console.log(`Loaded ${Object.keys(raw).length} captions from ${args.captionsFile}`);
    } catch (err) {
      console.warn(`Could not read ${args.captionsFile}: ${err}`);
    }
  }

  if (files.length === 0) {
    console.error(
      `No images found. Drop your past memes into ${args.imagesDir}/ (jpg, png, webp, gif) or pass --instagram-export.`,
    );
    process.exitCode = 1;
    return;
  }

  const existing = loadExistingCorpus(corpusFile);
  const known = new Set(existing.memes.map((meme) => meme.id));

  const pending: string[] = [];
  for (const file of files) {
    if (pending.length >= args.limit) break;
    if (!args.rebuild) {
      const hash = crypto
        .createHash("sha1")
        .update(fs.readFileSync(file))
        .digest("hex");
      if (known.has(hash)) continue;
    }
    pending.push(file);
  }

  console.log(
    `${files.length} images on disk, ${existing.memes.length} already catalogued, ${pending.length} to read.`,
  );

  if (args.dryRun || pending.length === 0) {
    if (args.dryRun) console.log("--dry-run, stopping before any API calls.");
    return;
  }

  if (!config.apiKeyConfigured) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env first.");
    process.exitCode = 1;
    return;
  }

  let done = 0;
  const extracted = await mapWithConcurrency(
    pending,
    args.concurrency,
    async (file) => {
      try {
        const meme = await extract(file, captions.get(path.resolve(file)));
        done++;
        if (meme) console.log(`[${done}/${pending.length}] ${meme.source}`);
        return meme;
      } catch (err) {
        done++;
        console.warn(`[${done}/${pending.length}] failed ${path.basename(file)}: ${err}`);
        return null;
      }
    },
  );

  const byId = new Map(existing.memes.map((meme) => [meme.id, meme]));
  for (const meme of extracted) if (meme) byId.set(meme.id, meme);

  const corpus: Corpus = {
    generatedAt: new Date().toISOString(),
    memes: [...byId.values()],
  };

  fs.mkdirSync(path.dirname(corpusFile), { recursive: true });
  fs.writeFileSync(corpusFile, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`Wrote ${corpus.memes.length} memes to ${config.corpusPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
