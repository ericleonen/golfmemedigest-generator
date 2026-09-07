import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { blobConfigured, blobError, countReferences } from "@/lib/reference";
import { loadWeights } from "@/lib/weights";
import type { HealthResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const references = await countReferences();
  const usingBlob = blobConfigured();

  const body: HealthResponse = {
    ok: true,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured,
    authRequired: Boolean(config.appPassword),
    referenceImages: references,
    referenceSampleSize: config.referenceSampleSize,
    blobConfigured: usingBlob,
    referenceSource: usingBlob ? "blob" : references > 0 ? "local" : "none",
    referenceError: blobError(),
    feedbackVotes: usingBlob ? (await loadWeights()).votes : 0,
  };
  return NextResponse.json(body);
}
