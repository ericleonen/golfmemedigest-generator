import type { NextFunction, Request, Response } from "express";
import { config } from "./config.ts";

/**
 * Anything public that spends your API credits needs a lid on it. Two cheap
 * ones: an optional shared password, and a per-IP hourly cap.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  // Render, Railway and Fly all sit behind a proxy that sets this.
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first ?? req.ip ?? "unknown").trim();
}

export function requirePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!config.appPassword) {
    next();
    return;
  }
  const supplied = req.header("x-app-password");
  if (supplied !== config.appPassword) {
    res.status(401).json({
      error: "Wrong password.",
      detail: "Ask the owner of this instance for the access password.",
    });
    return;
  }
  next();
}

export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (config.rateLimitPerHour <= 0) {
    next();
    return;
  }

  const now = Date.now();
  const key = clientKey(req);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    sweep(now);
    next();
    return;
  }

  if (bucket.count >= config.rateLimitPerHour) {
    const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / 60000));
    res.status(429).json({
      error: "Hourly limit reached.",
      detail: `Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
    return;
  }

  bucket.count++;
  next();
}

/** Keeps the in-memory map from growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
