import { randomBytes } from "node:crypto";

// Google Sign-In for the dashboard — config-driven, per-deployment (see
// .env.example). Every adopting org that self-hosts this project sets
// its own GOOGLE_CLIENT_ID/SECRET and its own access restriction; none
// of that is hardcoded here. Zero framework imports — same reasoning
// as src/lib/auth.ts, kept dependency-light for consistency even though
// this module is only ever imported from Route Handlers.
//
// ID token verification uses Google's own `tokeninfo` endpoint (one
// extra fetch) rather than hand-verifying the RS256 JWT against
// Google's rotating JWKS — a documented, supported pattern for
// server-side flows that avoids a JWT/JWKS dependency for something
// Google already validates. No PKCE: this is a confidential
// server-side client (GOOGLE_CLIENT_SECRET lives here, never shipped to
// a browser), which is exactly the case PKCE isn't needed for — CSRF is
// handled by the `state` cookie in the login/callback routes instead.

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

// Short-lived cookies for the OAuth round-trip only — unrelated to
// SESSION_COOKIE_NAME (src/lib/auth.ts), which is the actual dashboard
// session set only after this flow succeeds.
export const OAUTH_STATE_COOKIE = "oauth_state";
export const OAUTH_NEXT_COOKIE = "oauth_next";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes — long enough for the Google consent round-trip

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Derived from the request's own Host header (same trust model
// getClientIp() in src/lib/auth.ts already uses for x-forwarded-for),
// deliberately NOT from `new URL(request.url).origin` — behind Render's
// proxy (and reverse proxies generally), request.url reflects the
// internal address the platform forwards to (e.g. http://localhost:10000),
// not the public-facing domain. Confirmed directly against production:
// before this fix, the post-login redirect sent users to
// https://localhost:10000/..., unreachable from their own browser.
export function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isSecure = (forwardedProto ?? url.protocol.replace(":", "")) === "https";
  const host = request.headers.get("host") ?? url.host;
  return `${isSecure ? "https" : "http"}://${host}`;
}

export function resolveRedirectUri(request: Request): string {
  return `${resolveOrigin(request)}/api/auth/google/callback`;
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForIdToken(code: string, redirectUri: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;

  const body: unknown = await res.json().catch(() => null);
  const idToken = body && typeof body === "object" ? (body as Record<string, unknown>).id_token : undefined;
  return typeof idToken === "string" ? idToken : null;
}

export interface VerifiedGoogleIdentity {
  email: string;
  hd?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  const res = await fetch(`${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) return null;

  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  // aud must match our own client — tokeninfo validates the token's
  // signature/issuer/expiry, but NOT that it was issued for us; a
  // token meant for a different app would otherwise pass straight
  // through.
  if (record.aud !== clientId) return null;
  if (record.email_verified !== "true" && record.email_verified !== true) return null;
  if (typeof record.email !== "string" || !record.email) return null;

  return {
    email: record.email.toLowerCase(),
    hd: typeof record.hd === "string" ? record.hd.toLowerCase() : undefined,
  };
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

// Fails closed: if an org has configured Google credentials but set
// neither restriction, every login is rejected rather than silently
// allowing any Google account — mirrors src/lib/auth.ts's
// verifySessionToken() rejecting every session when SESSION_SECRET is
// missing, same "misconfiguration must never fail open" principle.
export function isEmailAllowed(email: string, hd: string | undefined): boolean {
  const allowedEmails = parseList(process.env.ALLOWED_DASHBOARD_EMAILS);
  const allowedDomains = parseList(process.env.ALLOWED_GOOGLE_HD);

  if (allowedEmails.length === 0 && allowedDomains.length === 0) return false;
  if (allowedEmails.includes(email.toLowerCase())) return true;
  if (hd && allowedDomains.includes(hd.toLowerCase())) return true;
  return false;
}
