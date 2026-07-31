import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { revokeProvisioningToken } from "@/lib/agentTokens";
import { terminateTokenSessions } from "@/lib/wsRegistry";
import { logAuditEvent } from "@/lib/auditLog";

// Revokes one provisioning token immediately: flips its stored status
// (blocks all *future* auth attempts, at verifyAgentCredential()) and
// force-closes any *currently open* WS session that authenticated with
// it (terminateTokenSessions(), mirroring how employee offboarding
// force-closes that employee's sessions in
// src/app/api/employees/[id]/revoke/route.ts).

export async function POST(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const id = body && typeof body === "object" ? (body as Record<string, unknown>).id : undefined;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "missing token id" }, { status: 400 });
  }

  const updated = await revokeProvisioningToken(id);
  if (!updated) {
    return NextResponse.json({ error: "token not found" }, { status: 404 });
  }

  const terminatedSessions = terminateTokenSessions(id);

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "provisioning_token_revoked",
    targetResource: id,
    details: { terminatedSessions },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ status: "revoked", terminatedSessions });
}
