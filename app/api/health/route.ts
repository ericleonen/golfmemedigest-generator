import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { blobConfigured, countReferences } from "@/lib/reference";
import { loadWeights } from "@/lib/weights";
import type { HealthResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const body: HealthResponse = {
    ok: true,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured,
    authRequired: Boolean(config.appPassword),
    referenceImages: await countReferences(),
    referenceSampleSize: config.referenceSampleSize,
    blobConfigured: blobConfigured(),
    feedbackVotes: blobConfigured() ? (await loadWeights()).votes : 0,
  };
  return NextResponse.json(body);
}
