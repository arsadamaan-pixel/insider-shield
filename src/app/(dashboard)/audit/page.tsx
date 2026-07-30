import { Header } from "@/components/layout/Header";
import { LiveAuditTrail } from "@/components/audit/LiveAuditTrail";
import { prisma } from "@/lib/prisma";
import type { AuditLogEntry } from "@/types";

// Reads live audit state from SQLite (new rows written by
// src/lib/auditLog.ts as security-relevant actions happen) — must not
// be frozen as a build-time snapshot.
export const dynamic = "force-dynamic";

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadAuditLog(): Promise<AuditLogEntry[]> {
  const rows = await prisma.auditLog.findMany({ orderBy: { timestamp: "desc" }, take: 200 });
  return rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    actorEmail: row.actorEmail,
    action: row.action,
    targetResource: row.targetResource,
    details: row.detailsJson ? safeJsonParse(row.detailsJson) : null,
    ipAddress: row.ipAddress,
  }));
}

export default async function AuditPage() {
  const [logs, highSeverityAlertCount, riskAvg] = await Promise.all([
    loadAuditLog(),
    prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } }),
    prisma.employee.aggregate({ _avg: { riskScore: true } }),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title="Audit Trail"
        highSeverityAlertCount={highSeverityAlertCount}
        riskScore={Math.round(riskAvg._avg.riskScore ?? 0)}
      />
      <div className="p-6">
        <LiveAuditTrail initialLogs={logs} />
      </div>
    </div>
  );
}
