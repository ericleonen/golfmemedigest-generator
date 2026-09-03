import "dotenv/config";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: int("PORT", 8787),

  /** Anthropic model used for meme writing and for corpus ingest. */
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5",

  /**
   * Reasoning effort. "high" is the API default and the best quality; drop to
   * "medium" or "low" if you want variants back faster.
   */
  effort: (process.env.CLAUDE_EFFORT ?? "high") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max",

  /** Default number of meme variants per request. */
  defaultVariantCount: int("VARIANT_COUNT", 4),
  maxVariantCount: int("MAX_VARIANT_COUNT", 6),

  /**
   * Character budget for the back-catalogue context. The whole corpus is sent
   * when it fits under this; past it, a rotating random sample is sent instead.
   * ~4 chars per token, so 400k chars is roughly 100k tokens.
   */
  corpusMaxChars: int("CORPUS_MAX_CHARS", 400_000),

  /**
   * How long one random sample stays stable, in ms. Keeping this under the
   * 5 minute prompt-cache TTL means back-to-back requests reuse the cached
   * prefix instead of paying full price for a fresh sample every time.
   */
  corpusSampleTtlMs: int("CORPUS_SAMPLE_TTL_MS", 4 * 60 * 1000),

  /** Where the ingest script writes and the server reads the corpus. */
  corpusPath: process.env.CORPUS_PATH ?? "data/corpus.json",

  /** Largest accepted upload, in bytes, before base64 overhead. */
  maxImageBytes: int("MAX_IMAGE_BYTES", 8 * 1024 * 1024),

  /**
   * Optional shared password for the whole app. Leave unset for a private
   * instance; set it before putting the app on a public domain, or anyone who
   * finds the URL spends your API credits.
   */
  appPassword: process.env.APP_PASSWORD ?? "",

  /** Generations allowed per IP per hour. 0 disables the cap. */
  rateLimitPerHour: int("RATE_LIMIT_PER_HOUR", 30),

  apiKeyConfigured: Boolean(
    process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN,
  ),
};

export type Config = typeof config;
