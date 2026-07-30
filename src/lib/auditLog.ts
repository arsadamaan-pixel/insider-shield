import { prisma } from "@/lib/prisma";
import { broadcast, dashboardSockets } from "@/lib/wsRegistry";
import type { AuditLogEntry } from "@/types";

// Server-only — transitively imports @/lib/prisma (native bindings), so
// this must never be imported from a "use client" component. The
// Audit page's client-side filter <select> imports its known action
// list from src/types/auditLog.ts instead, which has no server deps.

export interface LogAuditEventInput {
  actorEmail: string;
  action: string;
  targetResource: string;
  details?: unknown;
  ipAddress?: string;
}

// Never throws: a failure to persist or broadcast an audit entry must
// never fail or roll back the primary security action (policy update,
// revoke, ingest, auth check) it describes. Callers may await it or
// fire-and-forget it (e.g. the WS-upgrade auth-rejection call sites,
// which deliberately don't await before destroying the socket).
export async function logAuditEvent(input: LogAuditEventInput): Promise<void> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        actorEmail: input.actorEmail,
        action: input.action,
        targetResource: input.targetResource,
        detailsJson: input.details !== undefined ? JSON.stringify(input.details) : null,
        ipAddress: input.ipAddress,
      },
    });

    const entry: AuditLogEntry = {
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      actorEmail: row.actorEmail,
      action: row.action,
      targetResource: row.targetResource,
      details: row.detailsJson ? safeJsonParse(row.detailsJson) : null,
      ipAddress: row.ipAddress,
    };
    broadcast(dashboardSockets, { type: "audit_log", entry });
  } catch (err) {
    console.error("[auditLog] failed to record event:", err);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
