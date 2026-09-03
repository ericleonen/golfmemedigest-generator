import type {
  ApiError,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "../../shared/types";

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as ApiError;
    message = [body.error, body.detail].filter(Boolean).join(" — ") || message;
  } catch {
    // Non-JSON error body; keep the status-code message.
  }
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

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  return unwrap<HealthResponse>(response);
}
