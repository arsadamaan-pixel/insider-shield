import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  exchangeCodeForIdToken,
  isEmailAllowed,
  isGoogleAuthConfigured,
  resolveRedirectUri,
  verifyGoogleIdToken,
} from "@/lib/googleAuth";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearFailedLoginAttempts,
  createDashboardSessionCookieValue,
  getClientIp,
  isLoginRateLimited,
  recordFailedLoginAttempt,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/auditLog";

function loginFailedRedirect(origin: string, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

// Completes the Google Sign-In flow started by /api/auth/google/login.
// Validates the state cookie (CSRF), exchanges the code, verifies the
// ID token, and checks the org's own access-restriction config — on
// success, hands off to the *existing, unmodified* dashboard session
// mechanism (createDashboardSessionCookieValue in src/lib/auth.ts) with
// the verified email in the same `operator` slot a self-reported string
// used to occupy, so proxy.ts / the WS-upgrade check / audit
// attribution all keep working with zero changes downstream.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ip = getClientIp(request);

  const cookieStore = await cookies();
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const next = cookieStore.get(OAUTH_NEXT_COOKIE)?.value || "/";
  cookieStore.delete(OAUTH_STATE_COOKIE);
  cookieStore.delete(OAUTH_NEXT_COOKIE);

  if (!isGoogleAuthConfigured()) {
    return loginFailedRedirect(url.origin, "not_configured");
  }

  if (isLoginRateLimited(ip)) {
    return loginFailedRedirect(url.origin, "rate_limited");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !storedState || state !== storedState) {
    recordFailedLoginAttempt(ip);
    await logAuditEvent({
      actorEmail: "unknown",
      action: "login_failed",
      targetResource: "dashboard_session",
      details: { method: "google", reason: "invalid_or_missing_state" },
      ipAddress: ip,
    });
    return loginFailedRedirect(url.origin, "oauth_failed");
  }

  const redirectUri = resolveRedirectUri(request);
  const idToken = await exchangeCodeForIdToken(code, redirectUri);
  const identity = idToken ? await verifyGoogleIdToken(idToken) : null;

  if (!identity) {
    recordFailedLoginAttempt(ip);
    await logAuditEvent({
      actorEmail: "unknown",
      action: "login_failed",
      targetResource: "dashboard_session",
      details: { method: "google", reason: "token_exchange_or_verification_failed" },
      ipAddress: ip,
    });
    return loginFailedRedirect(url.origin, "oauth_failed");
  }

  if (!isEmailAllowed(identity.email, identity.hd)) {
    recordFailedLoginAttempt(ip);
    await logAuditEvent({
      actorEmail: identity.email,
      action: "login_failed",
      targetResource: "dashboard_session",
      details: { method: "google", reason: "email_not_allowed" },
      ipAddress: ip,
    });
    return loginFailedRedirect(url.origin, "not_allowed");
  }

  clearFailedLoginAttempts(ip);

  cookieStore.set(SESSION_COOKIE_NAME, createDashboardSessionCookieValue(identity.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  await logAuditEvent({
    actorEmail: identity.email,
    action: "login_succeeded",
    targetResource: "dashboard_session",
    details: { method: "google" },
    ipAddress: ip,
  });

  return NextResponse.redirect(new URL(next, url.origin));
}
