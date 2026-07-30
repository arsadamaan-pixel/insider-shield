import { NextResponse } from "next/server";
import { getPolicy, sanitizePolicyUpdate, setPolicy } from "@/lib/policyStore";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { logAuditEvent } from "@/lib/auditLog";

// OTA policy distribution endpoint. Validation logic lives in
// src/lib/policyStore.ts (sanitizePolicyUpdate), shared with the
// WebSocket dashboard-message handler in server.ts. Kept as a REST
// fallback/testing path and for the Policy Control Panel's offline
// fallback now that the real-time WebSocket transport (server.ts)
// exists. Dashboard-only — gated by the session cookie, not the agent's
// ORG_ACCESS_KEY.

export async function GET(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  const policy = await getPolicy();
  return NextResponse.json(policy);
}

export async function POST(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const update = sanitizePolicyUpdate(body);
  if (!update || Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no recognized policy fields in body" }, { status: 422 });
  }

  const updatedBy =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).updatedBy === "string"
      ? (body as Record<string, string>).updatedBy
      : "unknown";

  const updated = await setPolicy(update, updatedBy);

  const operator = getSessionOperator(request.headers.get("cookie"));
  await logAuditEvent({
    actorEmail: operator ?? updatedBy,
    action: "policy_update",
    targetResource: "SystemPolicy",
    details: update,
    ipAddress: getClientIp(request),
  });

  return NextResponse.json(updated, { status: 200 });
}
