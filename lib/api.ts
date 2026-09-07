import type {
  ApiError,
  FeedbackRequest,
  FeedbackResponse,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "@/shared/types";

/**
 * Access is a session cookie set at /login and checked by middleware, so
 * nothing here carries a password — the browser attaches the cookie itself.
 */
export class UnauthorizedError extends Error {}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as ApiError;
    message = [body.error, body.detail].filter(Boolean).join(" — ") || message;
  } catch {
    // Non-JSON error body; keep the status-code message.
  }
  if (response.status === 401) throw new UnauthorizedError(message);
  throw new Error(message);
}

export async function generateMemes(
  body: GenerateRequest,
): Promise<GenerateResponse> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<GenerateResponse>(response);
}

export async function sendFeedback(
  body: FeedbackRequest,
): Promise<FeedbackResponse> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<FeedbackResponse>(response);
}

export async function fetchHealth(): Promise<HealthResponse> {
  return unwrap<HealthResponse>(await fetch("/api/health"));
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}
