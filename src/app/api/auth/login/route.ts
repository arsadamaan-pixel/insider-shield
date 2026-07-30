import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearFailedLoginAttempts,
  createDashboardSessionCookieValue,
  getClientIp,
  isLoginRateLimited,
  isValidBearerToken,
  recordFailedLoginAttempt,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/auditLog";

export async function POST(request: Request) {
  const ip = getClientIp(request);

  if (isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "too many attempts — try again in a few minutes" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof record.token === "string" ? record.token : "";
  const operator = typeof record.operator === "string" ? record.operator.trim().slice(0, 64) || undefined : undefined;

  if (!isValidBearerToken(token)) {
    recordFailedLoginAttempt(ip);
    await logAuditEvent({
      actorEmail: operator ?? "unknown",
      action: "login_failed",
      targetResource: "dashboard_session",
      ipAddress: ip,
    });
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  clearFailedLoginAttempts(ip);

  (await cookies()).set(SESSION_COOKIE_NAME, createDashboardSessionCookieValue(operator), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  await logAuditEvent({
    actorEmail: operator ?? "dashboard-ui",
    action: "login_succeeded",
    targetResource: "dashboard_session",
    ipAddress: ip,
  });

  return NextResponse.json({ status: "ok" });
}
