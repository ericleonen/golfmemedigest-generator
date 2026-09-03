import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

/**
 * The style reference: a few of your actual past memes, sent to Claude as
 * images. Drop them in reference/ and commit them — no catalogue, no ingest
 * step, no descriptions. Claude looks at the real thing.
 */

const MEDIA_TYPES = new Map<string, "image/jpeg" | "image/png" | "image/webp">([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

/** The Claude API rejects base64 images over 5 MB. */
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;

export interface ReferenceImage {
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

function referenceRoot(): string {
  return path.join(process.cwd(), config.referenceDir);
}

export function listReferenceFiles(): string[] {
  const dir = referenceRoot();
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

/** Fisher-Yates over a copy — a fresh draw every request, no weighting. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function pickReferences(count = config.referenceSampleSize): ReferenceImage[] {
  const picked: ReferenceImage[] = [];

  for (const file of shuffle(listReferenceFiles())) {
    if (picked.length >= count) break;
    try {
      const bytes = fs.readFileSync(file);
      if (bytes.byteLength > MAX_REFERENCE_BYTES) {
        console.warn(`Skipping ${path.basename(file)}: over the 5 MB API limit.`);
        continue;
      }
      picked.push({
        name: path.basename(file),
        mediaType: MEDIA_TYPES.get(path.extname(file).toLowerCase())!,
        data: bytes.toString("base64"),
      });
    } catch (err) {
      console.warn(`Skipping ${path.basename(file)}: ${err}`);
    }
  }

  return picked;
}
