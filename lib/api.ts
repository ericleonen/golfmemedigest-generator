import type {
  ApiError,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "@/shared/types";

const PASSWORD_KEY = "golfmemedigest.password";

export function getPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPassword(password: string): void {
  try {
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {
    // Private browsing with storage blocked; the password just won't persist.
  }
}

/** Thrown when the instance is password-protected and ours is wrong or missing. */
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
    headers: {
      "Content-Type": "application/json",
      ...(getPassword() ? { "x-app-password": getPassword() } : {}),
    },
    body: JSON.stringify(body),
  });
  return unwrap<GenerateResponse>(response);
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  return unwrap<HealthResponse>(response);
}
