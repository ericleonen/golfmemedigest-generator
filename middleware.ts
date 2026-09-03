import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Gates the entire site behind APP_PASSWORD — the page, the API, everything.
 * With APP_PASSWORD unset the gate is off, which keeps local development and
 * a private instance friction-free.
 *
 * Reading process.env here rather than importing lib/config keeps the Edge
 * bundle to just this file and lib/session.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, password)) return NextResponse.next();

  // The API answers with JSON so the app can react, rather than handing fetch()
  // an HTML login page and letting it fail as a parse error.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not signed in.", detail: "Reload the page and enter the password." },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login screen itself, Next's own assets, and files
  // served straight out of public/.
  matcher: [
    "/((?!login|api/login|_next/static|_next/image|favicon.ico|logo\\.png|logo\\.svg).*)",
  ],
};
