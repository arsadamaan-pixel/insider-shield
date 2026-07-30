import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Deliberately zero "next/server"/"next/headers" imports in this file.
// server.ts imports this module at its top level, evaluated by tsx
// BEFORE next({...}) ever runs — loading Next's request-context modules
// that early (outside Next's own bootstrap) throws
// "AsyncLocalStorage accessed in runtime where it is not available".
// The NextResponse-returning convenience wrappers live in
// src/lib/authGuards.ts instead, imported only by Route Handlers, which
// Next loads lazily through its own request pipeline.
//
// Two shared secrets, two different audiences:
//   ORG_ACCESS_KEY — Chrome-extension agents (WS query param / REST header).
//   BEARER_TOKEN   — the SOC dashboard's single login credential.
// Neither is the extension's older, unrelated `orgKey` field (a random
// per-install device identifier, never validated by anything — see
// extension/background/background.js's dead getOrgKey()).
//
// All verification helpers here take plain strings (a header/cookie
// value already extracted by the caller) rather than a specific request
// type, so both server.ts's raw Node IncomingMessage (the WS upgrade
// path) and proxy.ts/Route Handlers' Request/NextRequest can each pull
// their own header string and pass it in through one shared contract.

export interface DashboardSessionPayload {
  iat: number;
  exp: number;
  operator?: string;
}

export const SESSION_COOKIE_NAME = "is_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

// crypto.timingSafeEqual throws on unequal-length buffers — branching on
// `a.length === b.length` first would leak length via timing/exception
// behavior. Hashing both inputs to a fixed 32-byte digest first means
// this is always called with two equal-length buffers and can never
// throw, without needing manual padding logic.
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function isValidOrgAccessKey(candidate: string | null | undefined): boolean {
  const expected = process.env.ORG_ACCESS_KEY;
  if (!expected || !candidate) return false;
  return timingSafeEqualStrings(candidate, expected);
}

export function isValidBearerToken(candidate: string | null | undefined): boolean {
  const expected = process.env.BEARER_TOKEN;
  if (!expected || !candidate) return false;
  return timingSafeEqualStrings(candidate, expected);
}

function hmacHex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

// Opaque HMAC-signed cookie value, not a JWT — this project needs one
// shared secret with no per-user claims beyond an optional operator
// label, so full JWT framing/algorithm-negotiation machinery (e.g. via
// `jose`) would add a dependency for no real benefit. Format:
// base64url(JSON(payload)) + "." + hex(HMAC-SHA256(that, SESSION_SECRET)).
export function createDashboardSessionCookieValue(operator?: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");

  const now = Date.now();
  const payload: DashboardSessionPayload = {
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS * 1000,
    ...(operator ? { operator } : {}),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${hmacHex(payloadB64, secret)}`;
}

// Fail-closed: a missing/misconfigured SESSION_SECRET means every
// session is rejected, not that verification is skipped.
function verifySessionToken(token: string | undefined): DashboardSessionPayload | null {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;
  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!payloadB64 || !signature) return null;

  if (!timingSafeEqualStrings(signature, hmacHex(payloadB64, secret))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as DashboardSessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractCookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    if (part.slice(0, eqIndex).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eqIndex + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function hasValidDashboardSession(cookieHeader: string | null | undefined): boolean {
  return verifySessionToken(extractCookieValue(cookieHeader, SESSION_COOKIE_NAME)) !== null;
}

export function getSessionOperator(cookieHeader: string | null | undefined): string | undefined {
  return verifySessionToken(extractCookieValue(cookieHeader, SESSION_COOKIE_NAME))?.operator;
}

// NextRequest.ip/.geo were removed in Next 15.0.0 — no built-in
// client-IP accessor remains, so this reads the standard proxy header
// directly (only present when actually behind a proxy/load balancer).
export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || undefined;
}

export const ORG_ACCESS_KEY_HEADER = "x-org-access-key";

// --- Lightweight in-memory login rate limiting -------------------------
// globalThis-cached, matching src/lib/wsRegistry.ts's pattern, so it
// survives tsx's/Next's separate module loaders. Cheap defense-in-depth
// against brute-forcing BEARER_TOKEN — not a substitute for a
// sufficiently random token.

interface LoginAttemptWindow {
  count: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const g = globalThis as unknown as { __loginAttempts?: Map<string, LoginAttemptWindow> };
const loginAttempts = g.__loginAttempts ?? new Map<string, LoginAttemptWindow>();
g.__loginAttempts = loginAttempts;

export function isLoginRateLimited(ip: string | undefined): boolean {
  if (!ip) return false;
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX_ATTEMPTS;
}

export function recordFailedLoginAttempt(ip: string | undefined): void {
  if (!ip) return;
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

export function clearFailedLoginAttempts(ip: string | undefined): void {
  if (!ip) return;
  loginAttempts.delete(ip);
}
