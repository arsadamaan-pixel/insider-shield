import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { revokeProvisioningToken } from "@/lib/agentTokens";
import { broadcast, dashboardSockets, terminateTokenSessions } from "@/lib/wsRegistry";
import { logAuditEvent } from "@/lib/auditLog";

// Permanently removes an endpoint from the Endpoints view: deletes its
// Heartbeat history and, when it authenticated with a per-device
// ProvisioningToken, revokes that token (mirroring
// src/app/api/admin/provision-token/revoke/route.ts) so it can't
// silently reappear on its next check-in. A shared-org-key agent (no
// tokenId) has no per-device credential to revoke — deleting its
// heartbeats is the most that can be done; it can reappear if the
// device heartbeats again, which the confirmation UI calls out.
export async function POST(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const tokenId = typeof b.tokenId === "string" && b.tokenId ? b.tokenId : undefined;
  const employeeEmail = typeof b.employeeEmail === "string" && b.employeeEmail ? b.employeeEmail : undefined;

  let deletedHeartbeats: number;
  let tokenRevoked = false;

  if (tokenId) {
    const deleted = await prisma.heartbeat.deleteMany({ where: { tokenId } });
    deletedHeartbeats = deleted.count;
    const revoked = await revokeProvisioningToken(tokenId);
    tokenRevoked = revoked !== null;
    terminateTokenSessions(tokenId);
  } else if (employeeEmail) {
    // Scoped to tokenId: null so this can never delete a different
    // per-device token's rows that happen to share the same email.
    const deleted = await prisma.heartbeat.deleteMany({ where: { employeeEmail, tokenId: null } });
    deletedHeartbeats = deleted.count;
  } else {
    const deleted = await prisma.heartbeat.deleteMany({ where: { tokenId: null, employeeEmail: null } });
    deletedHeartbeats = deleted.count;
  }

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "endpoint_deleted",
    targetResource: tokenId ?? employeeEmail ?? "unattributed",
    details: { deletedHeartbeats, tokenRevoked },
    ipAddress: getClientIp(request),
  });

  broadcast(dashboardSockets, { type: "agents_changed" });

  return NextResponse.json({ status: "deleted", deletedHeartbeats, tokenRevoked });
}
