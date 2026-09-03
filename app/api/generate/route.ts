import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { BadImageError, generateVariants } from "@/lib/claude";
import { config } from "@/lib/config";
import { checkAccess } from "@/lib/gate";
import type { GenerateRequest, GenerateResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Writing four meme variants takes tens of seconds. 60 is the ceiling on
 * Vercel's Hobby plan; on Pro you can raise this and also raise CLAUDE_EFFORT.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (typeof body?.image !== "string" || !body.image) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }

  if (!config.apiKeyConfigured) {
    return NextResponse.json(
      {
        error: "No Anthropic credentials",
        detail:
          "Set ANTHROPIC_API_KEY in the deployment's environment variables (or .env.local for local dev) and redeploy.",
      },
      { status: 500 },
    );
  }

  const count = Math.min(
    Math.max(Number(body.count) || config.defaultVariantCount, 1),
    config.maxVariantCount,
  );

  try {
    const result: GenerateResponse = await generateVariants({
      image: body.image,
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 400) : "",
      count,
      sampleSize: body.sampleSize,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BadImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        {
          error: "Rate limited by the Claude API.",
          detail: "Wait a few seconds and try again.",
        },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        {
          error: "Claude rejected the API key.",
          detail: "Check ANTHROPIC_API_KEY in your Vercel environment variables.",
        },
        { status: 500 },
      );
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { error: "Could not reach the Claude API.", detail: err.message },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "The Claude API returned an error.", detail: err.message },
        { status: 502 },
      );
    }
    console.error("generate failed:", err);
    return NextResponse.json(
      {
        error: "Meme generation failed.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
