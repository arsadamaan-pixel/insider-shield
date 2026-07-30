import type { DlpAlert, DlpSeverity } from "@/types";
import { prisma } from "@/lib/prisma";

// Shared between the REST ingestion route (src/app/api/telemetry/route.ts)
// and the WebSocket agent-message handler (server.ts) so both persist
// identically and never drift on validation/severity-mapping logic.

const RULE_SEVERITY: Record<string, DlpSeverity> = {
  credit_card_like: "high",
  ssn_like: "critical",
  api_key_like: "high",
  large_paste: "medium",
  large_copy_selection: "low",
  large_cut_selection: "low",
};

export interface IncomingDlpEvent {
  type: "dlp_event";
  hostname: string;
  ts: number;
  ruleName: string;
  excerptRedacted: string;
  orgKey?: string;
  employeeEmail?: string;
}

export interface IncomingHeartbeat {
  type: "heartbeat";
  ts: number;
  platform: { os: string; arch: string };
  status: string;
  orgKey?: string;
  employeeEmail?: string;
}

export function isValidDlpEvent(body: unknown): body is IncomingDlpEvent {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.type === "dlp_event" &&
    typeof b.hostname === "string" &&
    typeof b.ts === "number" &&
    typeof b.ruleName === "string" &&
    typeof b.excerptRedacted === "string"
  );
}

export function isValidHeartbeat(body: unknown): body is IncomingHeartbeat {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.type === "heartbeat" &&
    typeof b.ts === "number" &&
    typeof b.status === "string" &&
    typeof b.platform === "object" &&
    b.platform !== null
  );
}

export async function ingestDlpEvent(payload: IncomingDlpEvent): Promise<DlpAlert> {
  const employeeEmail = payload.employeeEmail ?? "unknown@insider-shield.dev";
  const [row, employee] = await Promise.all([
    prisma.dlpAlert.create({
      data: {
        timestamp: new Date(payload.ts),
        severity: RULE_SEVERITY[payload.ruleName] ?? "low",
        employeeEmail,
        ruleTriggered: payload.ruleName,
        // Metadata-only description — never the raw matched text.
        snippet: `DLP rule "${payload.ruleName}" triggered on ${payload.hostname}`,
        redactedContent: payload.excerptRedacted,
        sourceUrl: payload.hostname,
      },
    }),
    prisma.employee.findUnique({ where: { email: employeeEmail } }),
  ]);

  return {
    id: row.id,
    employeeId: row.employeeEmail,
    employeeName: employee?.name ?? row.employeeEmail,
    hostname: row.sourceUrl,
    ruleName: row.ruleTriggered,
    severity: row.severity as DlpSeverity,
    excerptRedacted: row.redactedContent,
    ts: row.timestamp.toISOString(),
    geoViolation: row.geoViolation,
    acknowledged: row.acknowledged,
  };
}

export async function ingestHeartbeat(payload: IncomingHeartbeat, meta?: { ipAddress?: string }): Promise<void> {
  await prisma.heartbeat.create({
    data: {
      orgKey: payload.orgKey ?? "unknown",
      employeeEmail: payload.employeeEmail,
      ipAddress: meta?.ipAddress,
      platform: JSON.stringify(payload.platform),
      timestamp: new Date(payload.ts),
      status: payload.status,
    },
  });

  if (payload.employeeEmail) {
    // updateMany, not update — an unrecognized/mistyped email (plausible,
    // since the extension's local-dev identity field is free text) must
    // silently match zero rows instead of throwing.
    await prisma.employee.updateMany({
      where: { email: payload.employeeEmail },
      data: { lastSeenAt: new Date(payload.ts), lastKnownIp: meta?.ipAddress },
    });
  }
}
