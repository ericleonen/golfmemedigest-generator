import { NextResponse } from "next/server";
import { blobConfigured } from "@/lib/reference";
import { recordVote } from "@/lib/weights";
import type { FeedbackRequest, FeedbackResponse } from "@/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a thumbs up or down on one variant, moving the odds of the reference
 * memes that produced it.
 *
 * The client sends a *delta*, not a state: it owns the toggle, so undoing a
 * like sends -1 and flipping a like to a dislike sends -2. That keeps the
 * server stateless about which variant is in which state.
 */
export async function POST(request: Request) {
  if (!blobConfigured()) {
    return NextResponse.json(
      {
        error: "Feedback needs the Blob store.",
        detail: "Scores are stored there; connect one and redeploy.",
      },
      { status: 501 },
    );
  }

  let body: FeedbackRequest;
  try {
    body = (await request.json()) as FeedbackRequest;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const references = Array.isArray(body?.references)
    ? body.references.filter((name): name is string => typeof name === "string").slice(0, 16)
    : [];
  const delta = Number(body?.delta);

  if (references.length === 0) {
    return NextResponse.json({ error: "No references given." }, { status: 400 });
  }
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 2) {
    return NextResponse.json(
      { error: "delta must be -2, -1, 1 or 2." },
      { status: 400 },
    );
  }

  try {
    const weights = await recordVote(references, delta);
    const body: FeedbackResponse = {
      votes: weights.votes,
      scores: Object.fromEntries(
        references.map((name) => [name, weights.scores[name] ?? 0]),
      ),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("feedback failed:", err);
    return NextResponse.json(
      {
        error: "Could not save that vote.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
