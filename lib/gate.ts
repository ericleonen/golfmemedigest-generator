import { NextResponse } from "next/server";
import { config } from "./config";

/**
 * Anything public that spends your API credits needs a lid on it. Two cheap
 * ones: an optional shared password, and a per-IP hourly cap.
 *
 * The cap is best-effort on serverless — the counter lives in one warm
 * instance's memory, so it is a speed bump rather than a guarantee. The
 * password is the real lock.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/** Returns a response to send back, or null when the request may proceed. */
export function checkAccess(request: Request): NextResponse | null {
  if (config.appPassword) {
    if (request.headers.get("x-app-password") !== config.appPassword) {
      return NextResponse.json(
        {
          error: "Wrong password.",
          detail: "Ask the owner of this instance for the access password.",
        },
        { status: 401 },
      );
    }
  }

  if (config.rateLimitPerHour <= 0) return null;

  const now = Date.now();
  const key = clientKey(request);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    sweep(now);
    return null;
  }

  if (bucket.count >= config.rateLimitPerHour) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60000));
    return NextResponse.json(
      {
        error: "Hourly limit reached.",
        detail: `Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      { status: 429 },
    );
  }

  bucket.count++;
  return null;
}

/** Keeps the in-memory map from growing without bound on a warm instance. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
