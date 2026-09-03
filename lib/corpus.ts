import corpusData from "@/data/corpus.json";
import { config } from "./config";
import type { Corpus, CorpusMeme, CorpusUsage } from "@/shared/types";

/**
 * The catalogue is imported, not read from disk at request time: a serverless
 * function has no reliable working directory, and bundling the JSON means the
 * deployed function always carries the voice it was built with. Re-run
 * `npm run ingest`, commit data/corpus.json, and the next deploy picks it up.
 */
export function loadCorpus(): Corpus {
  const parsed = corpusData as Corpus;
  return {
    generatedAt: parsed.generatedAt ?? "",
    memes: Array.isArray(parsed.memes) ? parsed.memes : [],
  };
}

/** One past meme, rendered as compact text for the style context block. */
function formatMeme(meme: CorpusMeme, index: number): string {
  const lines = [
    `--- past meme ${index + 1} ---`,
    `text on image: ${meme.memeText.replace(/\n/g, " / ")}`,
    `layout: ${meme.layout}`,
    `photo: ${meme.imageDescription}`,
    `joke device: ${meme.device}`,
  ];
  if (meme.topics.length) lines.push(`topics: ${meme.topics.join(", ")}`);
  if (meme.instagramCaption) lines.push(`ig caption: ${meme.instagramCaption}`);
  return lines.join("\n");
}

/** Deterministic PRNG so a given seed always produces the same sample. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface CorpusContext {
  /** The text block to drop into the system prompt. Empty when no corpus. */
  block: string;
  usage: CorpusUsage;
}

/**
 * Builds the style-context block.
 *
 * The whole back catalogue is sent when it fits inside `corpusMaxChars` — that
 * is the ideal, and Claude's 1M context makes it realistic for a few thousand
 * memes. Past that budget it falls back to a random sample that rotates on a
 * timer, so the prompt prefix stays byte-identical long enough for prompt
 * caching to pay off between requests.
 */
export function buildCorpusContext(now = Date.now()): CorpusContext {
  const { memes } = loadCorpus();
  if (memes.length === 0) {
    return { block: "", usage: { total: 0, used: 0, mode: "empty" } };
  }

  const formatted = memes.map(formatMeme);
  const totalChars = formatted.reduce((sum, entry) => sum + entry.length + 2, 0);

  if (totalChars <= config.corpusMaxChars) {
    return {
      block: formatted.join("\n\n"),
      usage: { total: memes.length, used: memes.length, mode: "full" },
    };
  }

  const seed = Math.floor(now / config.corpusSampleTtlMs);
  const shuffled = seededShuffle(memes, seed);

  const picked: string[] = [];
  let used = 0;
  for (const meme of shuffled) {
    const entry = formatMeme(meme, picked.length);
    if (used + entry.length + 2 > config.corpusMaxChars) break;
    picked.push(entry);
    used += entry.length + 2;
  }

  return {
    block: picked.join("\n\n"),
    usage: { total: memes.length, used: picked.length, mode: "sample" },
  };
}

export function corpusStats() {
  const { memes, generatedAt } = loadCorpus();
  const { usage } = buildCorpusContext();
  return {
    total: memes.length,
    mode: usage.mode,
    generatedAt: generatedAt || null,
  };
}
