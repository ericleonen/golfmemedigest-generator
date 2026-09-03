import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { listReferenceFiles } from "@/lib/reference";
import type { HealthResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const body: HealthResponse = {
    ok: true,
    model: config.model,
    apiKeyConfigured: config.apiKeyConfigured,
    authRequired: Boolean(config.appPassword),
    referenceImages: listReferenceFiles().length,
    referenceSampleSize: config.referenceSampleSize,
  };
  return NextResponse.json(body);
}
