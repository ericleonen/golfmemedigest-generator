import fs from "node:fs";
import path from "node:path";
import { list } from "@vercel/blob";
import { config } from "./config";

/**
 * The style reference: a few of your actual past memes, shown to Claude as
 * images. No catalogue, no descriptions — Claude looks at the real thing.
 *
 * Two sources, in order:
 *  1. Vercel Blob, when BLOB_READ_WRITE_TOKEN is set. Uploaded with
 *     `npm run upload -- <folder>`. Blob URLs are public and unguessable, so
 *     they go to Claude as URL image sources — the function never downloads a
 *     byte — and the browser can use the same URL for the thumbnails.
 *  2. The local reference/ folder otherwise, so a clone with no Blob store
 *     still runs.
 */

const MEDIA_TYPES = new Map<string, "image/jpeg" | "image/png" | "image/webp">([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

/** The Claude API rejects images over 5 MB. */
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;

const BLOB_PREFIX = "reference/";

/**
 * A reference image, in whichever form the caller can use: `url` for Blob
 * (passed straight to Claude and to the browser), `data` for local files.
 */
export interface ReferenceImage {
  name: string;
  /** Where the browser can load it for the "styled on" thumbnails. */
  thumbnailUrl: string;
  url?: string;
  mediaType?: "image/jpeg" | "image/png" | "image/webp";
  data?: string;
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Listing every blob on every request would be a wasted round trip for data
// that changes when you run the upload script. A warm function reuses this;
// a new upload shows up within the TTL without a redeploy.
const LISTING_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; blobs: { name: string; url: string }[] } | null = null;

async function listBlobs(): Promise<{ name: string; url: string }[]> {
  if (cache && Date.now() - cache.at < LISTING_TTL_MS) return cache.blobs;

  const blobs: { name: string; url: string }[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (MEDIA_TYPES.has(path.extname(blob.pathname).toLowerCase())) {
        blobs.push({ name: path.basename(blob.pathname), url: blob.url });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  cache = { at: Date.now(), blobs };
  return blobs;
}

function localFiles(): string[] {
  const dir = path.join(process.cwd(), config.referenceDir);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => MEDIA_TYPES.has(path.extname(name).toLowerCase()))
    .sort()
    .map((name) => path.join(dir, name));
}

/** How many reference images are available, for /api/health. */
export async function countReferences(): Promise<number> {
  if (blobConfigured()) {
    try {
      return (await listBlobs()).length;
    } catch (err) {
      console.error("Could not list the Blob store:", err);
      return 0;
    }
  }
  return localFiles().length;
}

/** Fisher-Yates over a copy — a fresh draw per variant, no weighting. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export async function pickReferences(
  count = config.referenceSampleSize,
): Promise<ReferenceImage[]> {
  if (blobConfigured()) {
    try {
      return shuffle(await listBlobs())
        .slice(0, count)
        .map((blob) => ({ name: blob.name, url: blob.url, thumbnailUrl: blob.url }));
    } catch (err) {
      console.error("Could not list the Blob store, falling back to local:", err);
    }
  }

  const picked: ReferenceImage[] = [];
  for (const file of shuffle(localFiles())) {
    if (picked.length >= count) break;
    try {
      const bytes = fs.readFileSync(file);
      if (bytes.byteLength > MAX_REFERENCE_BYTES) {
        console.warn(`Skipping ${path.basename(file)}: over the 5 MB API limit.`);
        continue;
      }
      const name = path.basename(file);
      picked.push({
        name,
        mediaType: MEDIA_TYPES.get(path.extname(file).toLowerCase())!,
        data: bytes.toString("base64"),
        thumbnailUrl: `/api/reference/${encodeURIComponent(name)}`,
      });
    } catch (err) {
      console.warn(`Skipping ${path.basename(file)}: ${err}`);
    }
  }
  return picked;
}

/** Local-file listing, used by the route that serves them in local mode. */
export function listLocalReferenceFiles(): string[] {
  return localFiles();
}
