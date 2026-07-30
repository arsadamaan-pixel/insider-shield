import { Activity, ShieldAlert, MapPinOff } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RiskGauge } from "@/components/dashboard/RiskGauge";
import { IncidentFeedTable } from "@/components/dashboard/IncidentFeedTable";
import { prisma } from "@/lib/prisma";
import type { DlpAlert, DlpSeverity } from "@/types";

// This reads live data from SQLite (employees, alerts, heartbeats) that
// changes as POST /api/telemetry is called — it must not be frozen as a
// build-time static snapshot.
export const dynamic = "force-dynamic";

async function loadDashboardData() {
  const [employees, alertRows, totalEndpointPings, highSeverityAlertCount, geoViolationCount, riskAvg] =
    await Promise.all([
      prisma.employee.findMany(),
      prisma.dlpAlert.findMany({ orderBy: { timestamp: "desc" }, take: 20 }),
      prisma.heartbeat.count(),
      prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } }),
      prisma.dlpAlert.count({ where: { geoViolation: true } }),
      prisma.employee.aggregate({ _avg: { riskScore: true } }),
    ]);

  const nameByEmail = new Map(employees.map((e) => [e.email, e.name]));

  const alerts: DlpAlert[] = alertRows.map((row) => ({
    id: row.id,
    employeeId: row.employeeEmail,
    employeeName: nameByEmail.get(row.employeeEmail) ?? row.employeeEmail,
    hostname: row.sourceUrl,
    ruleName: row.ruleTriggered,
    severity: row.severity as DlpSeverity,
    excerptRedacted: row.redactedContent,
    ts: row.timestamp.toISOString(),
    geoViolation: row.geoViolation,
    acknowledged: row.acknowledged,
  }));

  return {
    alerts,
    totalEndpointPings,
    highSeverityAlertCount,
    geoViolationCount,
    riskScore: Math.round(riskAvg._avg.riskScore ?? 0),
  };
}

export default async function Home() {
  const snapshot = await loadDashboardData();

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title="SOC Dashboard Overview"
        highSeverityAlertCount={snapshot.highSeverityAlertCount}
        riskScore={snapshot.riskScore}
      />

      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Total Endpoint Pings" value={snapshot.totalEndpointPings} icon={Activity} />
          <MetricCard
            label="High Severity DLP Alerts"
            value={snapshot.highSeverityAlertCount}
            icon={ShieldAlert}
            tone="warning"
          />
          <MetricCard
            label="Geo Compliance Violations"
            value={snapshot.geoViolationCount}
            icon={MapPinOff}
            tone="critical"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <RiskGauge score={snapshot.riskScore} />
          </div>
          <div className="lg:col-span-3">
            <IncidentFeedTable alerts={snapshot.alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
