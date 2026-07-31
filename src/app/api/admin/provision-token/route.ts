import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { createProvisioningToken, listProvisioningTokens, UnknownEmployeeError } from "@/lib/agentTokens";
import { logAuditEvent } from "@/lib/auditLog";

// Admin-only (dashboard session required — never ORG_ACCESS_KEY; an
// agent must never be able to mint its own credentials). POST generates
// a new per-device token; GET lists existing ones. Actual agent
// authentication using these tokens happens in server.ts's WS-upgrade
// handler and src/lib/authGuards.ts's requireOrgAccessKey(), both via
// src/lib/agentTokens.ts's verifyAgentCredential() — this route only
// manages the tokens, it never authenticates agent traffic itself.

interface CreateTokenBody {
  employeeId?: unknown;
  deviceName?: unknown;
  expirationDays?: unknown;
}

export async function POST(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = (body && typeof body === "object" ? body : {}) as CreateTokenBody;

  const employeeId =
    typeof record.employeeId === "string" && record.employeeId.trim() ? record.employeeId.trim() : undefined;
  const deviceName =
    typeof record.deviceName === "string" && record.deviceName.trim()
      ? record.deviceName.trim().slice(0, 120)
      : undefined;
  const expirationDays =
    typeof record.expirationDays === "number" && Number.isFinite(record.expirationDays) && record.expirationDays > 0
      ? Math.floor(record.expirationDays)
      : undefined;

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  const ipAddress = getClientIp(request);

  let created;
  try {
    created = await createProvisioningToken({ employeeId, deviceName, expirationDays, createdBy: operator });
  } catch (err) {
    if (err instanceof UnknownEmployeeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const { raw, record: token } = created;

  await logAuditEvent({
    actorEmail: operator,
    action: "provisioning_token_created",
    targetResource: token.id,
    details: {
      employeeId: token.employeeId,
      deviceName: token.deviceName,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    },
    ipAddress,
  });

  // `token` (raw) is returned exactly this once — it is never persisted
  // or retrievable again, only its SHA-256 hash is stored.
  return NextResponse.json(
    {
      id: token.id,
      token: raw,
      tokenPrefix: token.tokenPrefix,
      employeeId: token.employeeId,
      deviceName: token.deviceName,
      status: "active",
      createdAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    },
    { status: 201 }
  );
}

export async function GET(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  const tokens = await listProvisioningTokens();
  return NextResponse.json({ tokens });
}
