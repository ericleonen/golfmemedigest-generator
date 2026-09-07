import { head, put } from "@vercel/blob";
import { config } from "./config";

/**
 * Per-reference scores, learned from thumbs up/down on generated memes.
 *
 * A like adds +1 to every reference that produced that variant, a dislike -1.
 * Credit assignment is deliberately crude: three references made the meme and
 * all three get the same credit, even though probably only one of them was
 * responsible. Over many votes the noise averages out and the references that
 * keep showing up in good memes drift upward.
 *
 * Stored as one small JSON blob next to the images, so there is no second
 * service to set up.
 */

const WEIGHTS_PATH = "meta/weights.json";

/** Blob will not cache below 60s, so reads carry a cache-buster instead. */
const CACHE_TTL_MS = 60 * 1000;

/** Bounds on the multiplier, so nothing is ever excluded or ever dominates. */
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 10;

export interface Weights {
  updatedAt: string;
  votes: number;
  /** Reference file name → cumulative score. Absent means zero. */
  scores: Record<string, number>;
}

const EMPTY: Weights = { updatedAt: "", votes: 0, scores: {} };

let cache: { at: number; data: Weights } | null = null;

/**
 * Read-modify-write on a single JSON file races if two votes land at once.
 * Chaining every mutation through one promise serialises them within an
 * instance, which is all a single-user app needs; two concurrent instances
 * could still interleave, and the cost of that is one lost vote.
 */
let writeChain: Promise<unknown> = Promise.resolve();

async function fetchWeights(): Promise<Weights> {
  let url: string;
  try {
    url = (await head(WEIGHTS_PATH)).url;
  } catch {
    // Nothing stored yet — the first vote creates it.
    return EMPTY;
  }

  try {
    // The cache-buster defeats the CDN, which will not hold this below 60s.
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return EMPTY;
    const parsed = (await response.json()) as Partial<Weights>;
    return {
      updatedAt: parsed.updatedAt ?? "",
      votes: typeof parsed.votes === "number" ? parsed.votes : 0,
      scores:
        parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
    };
  } catch (err) {
    console.error("Could not read the weights file:", err);
    return EMPTY;
  }
}

export async function loadWeights(): Promise<Weights> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await fetchWeights();
  cache = { at: Date.now(), data };
  return data;
}

/** Applies a vote to every reference behind one variant. */
export async function recordVote(
  references: string[],
  delta: number,
): Promise<Weights> {
  const run = writeChain.then(async () => {
    // Read through the cache: a vote moments after another one must see it.
    const current = cache ? cache.data : await fetchWeights();
    const scores = { ...current.scores };

    for (const name of references) {
      scores[name] = (scores[name] ?? 0) + delta;
    }

    const next: Weights = {
      updatedAt: new Date().toISOString(),
      votes: current.votes + 1,
      scores,
    };

    await put(WEIGHTS_PATH, JSON.stringify(next), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Hold the authoritative copy locally; the CDN may still serve the old one.
    cache = { at: Date.now(), data: next };
    return next;
  });

  writeChain = run.catch(() => undefined);
  return run;
}

/**
 * Turns a score into a sampling multiplier.
 *
 * Exponential so each vote is a constant proportional nudge rather than a
 * shrinking one, clamped so a well-liked reference cannot crowd out the rest
 * and a disliked one never disappears entirely — it should still get an
 * occasional chance to prove the votes wrong.
 */
export function samplingWeight(score: number | undefined): number {
  if (!score) return 1;
  const raw = Math.exp(config.feedbackLearningRate * score);
  return Math.min(Math.max(raw, MIN_WEIGHT), MAX_WEIGHT);
}
