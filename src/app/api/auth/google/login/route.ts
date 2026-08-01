import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  buildGoogleAuthUrl,
  generateOAuthState,
  isGoogleAuthConfigured,
  resolveRedirectUri,
} from "@/lib/googleAuth";

// Entry point for the "Sign in with Google" link on /login — a plain
// GET redirect, not a form submission, since nothing state-changing
// happens until the callback (which does the real CSRF check via the
// state cookie set here).
export async function GET(request: Request) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json({ error: "Google Sign-In is not configured on this deployment" }, { status: 404 });
  }

  const url = new URL(request.url);
  const requestedNext = url.searchParams.get("next");
  // Only a same-site relative path is ever honored — "/" or "//evil.com"
  // (browser-treated as protocol-relative) or an absolute URL would
  // otherwise turn this into an open redirect after a real login.
  const next = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const state = generateOAuthState();
  const redirectUri = resolveRedirectUri(request);

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  cookieStore.set(OAUTH_NEXT_COOKIE, next, cookieOpts);

  return NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
}
