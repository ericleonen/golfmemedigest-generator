function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  /** Anthropic model used to write the memes. */
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5",

  /**
   * Reasoning effort. "high" is the API default and the best quality, but a
   * Vercel function has a hard wall-clock limit (60s on Hobby), so the default
   * here is "medium" to stay comfortably inside it.
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

  /** Folder of past memes, shown to Claude as the house style. */
  referenceDir: process.env.REFERENCE_DIR ?? "reference",

  /** How many of them to show per run. Each one costs vision tokens. */
  referenceSampleSize: int("REFERENCE_SAMPLE_SIZE", 4),

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
