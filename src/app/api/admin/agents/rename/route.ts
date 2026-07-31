import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { renameProvisioningToken } from "@/lib/agentTokens";
import { prisma } from "@/lib/prisma";
import { broadcast, dashboardSockets } from "@/lib/wsRegistry";
import { logAuditEvent } from "@/lib/auditLog";

const MAX_DEVICE_NAME_LENGTH = 100;

// Renames a token-based endpoint's display label. Only valid for agents
// that authenticated with a per-device ProvisioningToken — deviceName
// lives on that row, so a shared-org-key agent (no tokenId) has nothing
// to rename; the frontend disables the action for those rows.
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
  const tokenId = typeof b.tokenId === "string" ? b.tokenId : undefined;
  const deviceName = typeof b.deviceName === "string" ? b.deviceName.trim() : undefined;

  if (!tokenId) {
    return NextResponse.json({ error: "missing tokenId" }, { status: 400 });
  }
  if (!deviceName || deviceName.length > MAX_DEVICE_NAME_LENGTH) {
    return NextResponse.json(
      { error: `deviceName must be 1-${MAX_DEVICE_NAME_LENGTH} characters` },
      { status: 400 }
    );
  }

  const existing = await prisma.provisioningToken.findUnique({ where: { id: tokenId } });
  if (!existing) {
    return NextResponse.json({ error: "token not found" }, { status: 404 });
  }

  const updated = await renameProvisioningToken(tokenId, deviceName);

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "endpoint_renamed",
    targetResource: tokenId,
    details: { oldName: existing.deviceName, newName: deviceName },
    ipAddress: getClientIp(request),
  });

  broadcast(dashboardSockets, { type: "agents_changed" });

  return NextResponse.json({ status: "renamed", token: updated });
}
