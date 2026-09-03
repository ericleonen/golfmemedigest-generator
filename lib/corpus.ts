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

/**
 * How well a post did, as a single number.
 *
 * Comments are weighted above likes because they cost the reader more, so they
 * separate "this landed" from "this scrolled past pleasantly". In "rate" mode
 * the score is divided by views, which measures the joke rather than how far
 * the algorithm happened to push the post — useful once your reach is uneven.
 */
export function engagementScore(meme: CorpusMeme): number | null {
  const { likes, comments, views } = meme.engagement ?? {};
  if (likes == null && comments == null) return null;

  const raw = (likes ?? 0) + config.commentWeight * (comments ?? 0);

  if (config.engagementMode === "rate") {
    if (!views || views <= 0) return null;
    return raw / views;
  }
  return raw;
}

/** The median of a list, used as the stand-in score for unrated posts. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Weighted sampling without replacement (Efraimidis–Spirakis): give each item a
 * key of `random ^ (1 / weight)` and keep the highest `k`. One pass, no
 * re-normalising after each draw, and the probability of being drawn is
 * proportional to the weight.
 */
function weightedSample<T>(
  items: T[],
  count: number,
  weightOf: (item: T) => number,
): T[] {
  return items
    .map((item) => {
      const weight = Math.max(weightOf(item), Number.EPSILON);
      // Math.random() can return exactly 0, which would make the key 0 for
      // every item and quietly turn the draw into "first k in array order".
      const u = Math.random() || Number.EPSILON;
      return { item, key: Math.pow(u, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((entry) => entry.item);
}

/** Worst odds any post can have, as a fraction of the median post's. */
const MIN_RELATIVE_WEIGHT = 0.05;

export interface CorpusContext {
  /** The text block to drop into the system prompt. Empty when no corpus. */
  block: string;
  usage: CorpusUsage;
}

/**
 * Draws a handful of past memes to show Claude as the house voice.
 *
 * A fresh random draw every time is the point: a small, varied sample produces
 * genuinely different jokes run to run, where a fixed block of the whole
 * catalogue pulls every request toward the same average. Posts that did well
 * are proportionally more likely to be drawn, so the voice tracks what actually
 * landed rather than everything ever posted.
 *
 * Posts with no engagement numbers are scored at the catalogue median, so a
 * half-annotated catalogue still draws from all of it instead of silently
 * ignoring the unrated part.
 */
export function buildCorpusContext(sampleSize?: number): CorpusContext {
  const { memes } = loadCorpus();
  const size = clampSampleSize(sampleSize);

  if (memes.length === 0) {
    return { block: "", usage: { total: 0, used: 0, sources: [] } };
  }

  const scores = new Map<string, number>();
  const known: number[] = [];
  for (const meme of memes) {
    const score = engagementScore(meme);
    if (score != null) {
      scores.set(meme.id, score);
      known.push(score);
    }
  }

  // Weights are scores relative to the catalogue median, not raw scores. That
  // keeps the units out of it — "absolute" scores run in the thousands while
  // "rate" scores are small fractions, and a raw weight would make one mode
  // lopsided and the other a no-op. Relative to the median, both behave the
  // same and engagementPower means the same thing in each.
  const middle = median(known);
  const relative = (score: number) => (middle > 0 ? score / middle : 1);

  const drawn = weightedSample(memes, size, (meme) => {
    const score = scores.get(meme.id);
    // An unrated post is treated as median — a half-annotated catalogue should
    // still draw from all of it, not silently collapse onto the rated part.
    const ratio = score == null ? 1 : relative(score);
    // The floor keeps a post that flopped in the running at long odds instead
    // of dropping it from the catalogue entirely.
    return Math.pow(Math.max(ratio, MIN_RELATIVE_WEIGHT), config.engagementPower);
  });

  return {
    block: drawn.map(formatMeme).join("\n\n"),
    usage: {
      total: memes.length,
      used: drawn.length,
      sources: drawn.map((meme) => meme.source),
    },
  };
}

export function clampSampleSize(requested?: number): number {
  const value = Number(requested) || config.sampleSize;
  return Math.min(Math.max(Math.round(value), 1), config.maxSampleSize);
}

export function corpusStats() {
  const { memes, generatedAt } = loadCorpus();
  return {
    total: memes.length,
    withEngagement: memes.filter((meme) => engagementScore(meme) != null).length,
    generatedAt: generatedAt || null,
  };
}
