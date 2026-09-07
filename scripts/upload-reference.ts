/**
 * Uploads a folder of past memes to Vercel Blob, where the app draws its style
 * reference from.
 *
 *   npm run upload -- ~/Pictures/golfmemedigest
 *   npm run upload -- ~/Pictures/golfmemedigest --dry-run
 *   npm run upload -- ~/Pictures/golfmemedigest --limit 100 --concurrency 12
 *
 * Images only — folders, videos and anything that is not a JPEG, PNG or WebP is
 * skipped and counted. Each image is resized to fit MAX_DIM on its long edge
 * before upload, which keeps storage small and vision tokens down; pass
 * --no-resize to upload the originals.
 *
 * Re-running is safe and cheap: the store is listed first and anything already
 * there is skipped, so you can add new memes to the folder and run it again.
 */
import "./env"; // must stay first: populates process.env before anything reads it
import fs from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";
import sharp from "sharp";
import { Progress, humanBytes, humanDuration } from "./progress";

/** Extensions Claude can read as images. Everything else is skipped. */
const IMAGE_EXTENSIONS = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

/** Where uploads land inside the store, so they are easy to find and delete. */
const PREFIX = "reference/";

const MAX_DIM = 1080;
const JPEG_QUALITY = 82;

interface Args {
  folder: string;
  concurrency: number;
  limit: number;
  resize: boolean;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    folder: "",
    concurrency: 8,
    limit: Infinity,
    resize: true,
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--concurrency":
        args.concurrency = Math.max(1, Number(argv[++i]) || 8);
        break;
      case "--limit":
        args.limit = Math.max(1, Number(argv[++i]) || Infinity);
        break;
      case "--no-resize":
        args.resize = false;
        break;
      case "--force":
        args.force = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        if (flag?.startsWith("--")) {
          fail(`Unknown flag ${flag}`);
        } else if (flag && !args.folder) {
          args.folder = flag;
        }
    }
  }

  return args;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

interface Candidate {
  file: string;
  /** Name it gets in the store: the file name, lowercased and made safe. */
  pathname: string;
  bytes: number;
}

/**
 * Walks the folder one level deep only — sub-folders are reported, not
 * descended into, so a stray "videos/" directory cannot quietly add 400 files.
 */
function collect(
  folder: string,
  resize: boolean,
): {
  candidates: Candidate[];
  skipped: { name: string; why: string }[];
  folders: number;
} {
  const candidates: Candidate[] = [];
  const skipped: { name: string; why: string }[] = [];
  let folders = 0;

  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      folders++;
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      skipped.push({ name: entry.name, why: extension || "no extension" });
      continue;
    }

    const file = path.join(folder, entry.name);
    candidates.push({
      file,
      pathname: PREFIX + safeName(entry.name, resize),
      bytes: fs.statSync(file).size,
    });
  }

  return { candidates: candidates.sort((a, b) => a.pathname.localeCompare(b.pathname)), skipped, folders };
}

/**
 * The name a file gets in the store. Blob pathnames end up in a URL, so keep
 * them boring.
 *
 * The extension has to be settled here rather than after resizing: this name is
 * what the "already uploaded?" check compares against, and resizing re-encodes
 * everything to JPEG. Deciding it later meant every PNG looked new on each run
 * and was uploaded again forever.
 */
function safeName(name: string, resize: boolean): string {
  const original = path.extname(name).toLowerCase();
  const stem = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const extension = resize || original === ".jpeg" ? ".jpg" : original;
  return `${stem || "meme"}${extension}`;
}

async function listExisting(): Promise<Set<string>> {
  const existing = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) existing.add(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return existing;
}

/** Resize to fit MAX_DIM without enlarging anything already smaller. */
async function prepare(
  candidate: Candidate,
  resize: boolean,
): Promise<{ body: Buffer; contentType: string }> {
  const original = await fs.promises.readFile(candidate.file);
  const contentType = IMAGE_EXTENSIONS.get(
    path.extname(candidate.file).toLowerCase(),
  )!;

  if (!resize) return { body: original, contentType };

  const image = sharp(original, { failOn: "none" });
  const meta = await image.metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);

  // Already small enough and already JPEG: send it untouched.
  if (longEdge > 0 && longEdge <= MAX_DIM && contentType === "image/jpeg") {
    return { body: original, contentType };
  }

  const body = await image
    .rotate() // honour EXIF orientation before we discard the metadata
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  // safeName() already gave this a .jpg name, matching the re-encode.
  return { body, contentType: "image/jpeg" };
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index]!);
      }
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.folder) {
    fail(
      "Usage: npm run upload -- <folder> [--dry-run] [--limit N] [--concurrency N] [--no-resize] [--force]",
    );
  }

  const folder = path.resolve(args.folder.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    fail(`Not a folder: ${folder}`);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    fail(
      "BLOB_READ_WRITE_TOKEN is not set.\n" +
        "  Create a Blob store in the Vercel dashboard (Storage → Create → Blob),\n" +
        "  then run `npx vercel env pull .env.local` to fetch the token.",
    );
  }

  console.log(`\n  Source   ${folder}`);

  const { candidates, skipped, folders } = collect(folder, args.resize);
  console.log(
    `  Found    ${candidates.length} image${candidates.length === 1 ? "" : "s"}` +
      `${skipped.length ? `, skipped ${skipped.length} non-image file${skipped.length === 1 ? "" : "s"}` : ""}` +
      `${folders ? `, ignored ${folders} sub-folder${folders === 1 ? "" : "s"}` : ""}`,
  );

  if (skipped.length) {
    const kinds = [...new Set(skipped.map((s) => s.why))].sort().slice(0, 8);
    console.log(`           (skipped types: ${kinds.join(", ")})`);
  }
  if (candidates.length === 0) {
    fail("Nothing to upload. Are these JPEG, PNG or WebP files?");
  }

  console.log("  Checking what is already in the store…");
  const existing = args.force ? new Set<string>() : await listExisting();
  if (!args.force) {
    console.log(`  Store    ${existing.size} already there`);
  }

  const queue = candidates
    .filter((candidate) => args.force || !existing.has(candidate.pathname))
    .slice(0, args.limit === Infinity ? undefined : args.limit);

  const alreadyThere = candidates.length - queue.length;
  console.log(
    `  Queue    ${queue.length} to upload` +
      `${alreadyThere > 0 ? `, ${alreadyThere} skipped as already uploaded` : ""}` +
      `${args.resize ? `, resizing to ${MAX_DIM}px` : ", originals"}\n`,
  );

  if (queue.length === 0) {
    console.log("  Nothing to do — the store is up to date.\n");
    return;
  }
  if (args.dryRun) {
    for (const candidate of queue.slice(0, 10)) {
      console.log(`    ${candidate.pathname}  (${humanBytes(candidate.bytes)})`);
    }
    if (queue.length > 10) console.log(`    …and ${queue.length - 10} more`);
    console.log("\n  --dry-run, nothing uploaded.\n");
    return;
  }

  const progress = new Progress(queue.length);
  const failures: { name: string; error: string }[] = [];

  await runPool(queue, args.concurrency, async (candidate) => {
    try {
      const { body, contentType } = await prepare(candidate, args.resize);
      await put(candidate.pathname, body, {
        access: "public",
        contentType,
        // Names come from the file names, so keep them predictable and let a
        // re-upload of the same meme replace it rather than duplicate it.
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      progress.tick(body.byteLength, path.basename(candidate.pathname));
    } catch (err) {
      failures.push({
        name: path.basename(candidate.file),
        error: err instanceof Error ? err.message : String(err),
      });
      progress.tick(0, `failed: ${path.basename(candidate.file)}`);
    }
  });

  progress.finish();

  const uploaded = queue.length - failures.length;
  console.log(
    `  Uploaded ${uploaded}/${queue.length} · ${humanBytes(progress.totalBytes)} · ${humanDuration(
      progress.elapsedMs,
    )}`,
  );

  if (failures.length) {
    console.log(`\n  ${failures.length} failed:`);
    for (const failure of failures.slice(0, 10)) {
      console.log(`    ${failure.name}: ${failure.error}`);
    }
    if (failures.length > 10) console.log(`    …and ${failures.length - 10} more`);
    console.log("\n  Re-run to retry — anything that landed is skipped.\n");
    process.exitCode = 1;
    return;
  }

  console.log(
    "\n  Done. The app picks from these automatically — no redeploy needed.\n" +
      "  Check /api/health to confirm the count.\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
