/**
 * Signed session cookie for the shared-password gate.
 *
 * Uses Web Crypto rather than node:crypto so the same code runs in the Edge
 * runtime (middleware, which gates every request) and in Node route handlers.
 *
 * The cookie carries an expiry and an HMAC of that expiry keyed by the app
 * password. Nothing secret is stored in it, and changing APP_PASSWORD
 * invalidates every outstanding session for free.
 */

export const SESSION_COOKIE = "gmd_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

async function sign(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, branch-free comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(password: string): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expires}.${await sign(`gmd:${expires}`, password)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expires = Number(token.slice(0, separator));
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;

  const expected = await sign(`gmd:${expires}`, password);
  return safeEqual(token.slice(separator + 1), expected);
}
