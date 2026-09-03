function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function float(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  // Explicit check, not `|| fallback`: 0 is a meaningful value here.
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const config = {
  /** Anthropic model used for meme writing and for corpus ingest. */
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5",

  /**
   * Reasoning effort. "high" is the API default and the best quality, but a
   * Vercel function has a hard wall-clock limit (60s on Hobby), so the default
   * here is "medium" to stay comfortably inside it. Raise it if your plan
   * allows a longer maxDuration and you want the extra quality.
   */
  effort: (process.env.CLAUDE_EFFORT ?? "medium") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",

  /** Default number of meme variants per request. */
  defaultVariantCount: int("VARIANT_COUNT", 4),
  maxVariantCount: int("MAX_VARIANT_COUNT", 6),

  /** How many past memes to show as style context, when the UI does not say. */
  sampleSize: int("SAMPLE_SIZE", 4),
  maxSampleSize: int("MAX_SAMPLE_SIZE", 8),

  /**
   * A comment is worth this many likes when scoring a past post. Comments cost
   * the reader more, so they separate "this landed" from "this scrolled past
   * pleasantly".
   */
  commentWeight: int("COMMENT_WEIGHT", 5),

  /**
   * "absolute" ranks by raw likes and comments. "rate" divides by views, which
   * scores the joke rather than how far the algorithm pushed the post — better
   * once your reach is uneven, but it needs view counts on every post.
   */
  engagementMode: (process.env.ENGAGEMENT_MODE ?? "absolute") as
    | "absolute"
    | "rate",

  /**
   * How hard popularity pulls the draw, as an exponent on each post's score
   * relative to the catalogue median. 0 is a flat random sample, 1 is
   * proportional, 2 strongly favours the hits.
   *
   * The default is 0.5 because engagement is heavy-tailed: at 1, one viral post
   * turns up in almost every draw and the variety you wanted from sampling
   * disappears. Square-rooting keeps the ordering while leaving room for the
   * rest of the catalogue.
   */
  engagementPower: float("ENGAGEMENT_POWER", 0.5),

  /** Where the ingest script writes the corpus. Read at build time, not runtime. */
  corpusPath: process.env.CORPUS_PATH ?? "data/corpus.json",

  /**
   * Largest accepted upload, in bytes, before base64 overhead. Vercel rejects
   * request bodies over 4.5 MB before our code ever sees them, so this sits
   * below that to fail with a readable message instead.
   */
  maxImageBytes: int("MAX_IMAGE_BYTES", 3 * 1024 * 1024),

  /**
   * Optional shared password for the whole app. Leave unset for a private
   * instance; set it before putting the app on a public domain, or anyone who
   * finds the URL spends your API credits.
   */
  appPassword: process.env.APP_PASSWORD ?? "",

  /**
   * Generations allowed per IP per hour. 0 disables the cap. Best-effort only
   * on serverless: the counter lives in one function instance's memory, so a
   * determined abuser spread across cold starts gets more than this. Treat
   * APP_PASSWORD as the real lock and this as a speed bump.
   */
  rateLimitPerHour: int("RATE_LIMIT_PER_HOUR", 30),

  apiKeyConfigured: Boolean(
    process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN,
  ),
};

export type Config = typeof config;
