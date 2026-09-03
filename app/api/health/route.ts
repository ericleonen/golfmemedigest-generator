import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { corpusStats } from "@/lib/corpus";
import type { HealthResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const body: HealthResponse = {
    ok: true,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured,
    authRequired: Boolean(config.appPassword),
    corpus: corpusStats(),
    sample: { default: config.sampleSize, max: config.maxSampleSize },
  };
  return NextResponse.json(body);
}
