import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { listLocalReferenceFiles } from "@/lib/reference";

export const runtime = "nodejs";

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Serves a local reference meme so the UI can show which ones shaped each
 * variant. Only used when there is no Blob store — Blob references carry their
 * own public URL and the browser loads those directly.
 * The requested name is matched against the real listing rather than joined
 * onto a path, so "../../.env" cannot resolve to anything.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const match = listLocalReferenceFiles().find((file) => path.basename(file) === name);
  if (!match) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = fs.readFileSync(match);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type":
        MEDIA_TYPES[path.extname(match).toLowerCase()] ?? "application/octet-stream",
      // Private: these sit behind the password gate.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
