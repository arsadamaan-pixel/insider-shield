import { Header } from "@/components/layout/Header";
import { EmployeeTable } from "@/components/users/EmployeeTable";
import { prisma } from "@/lib/prisma";
import { riskLevelFromScore } from "@/lib/risk";
import type { EnrichedEmployee } from "@/types";

// Reads live employee state from SQLite (status changes via the
// offboard/revoke action) — must not be frozen as a build-time snapshot.
export const dynamic = "force-dynamic";

async function loadEmployees(): Promise<EnrichedEmployee[]> {
  const rows = await prisma.employee.findMany({ orderBy: { riskScore: "desc" } });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    department: e.department,
    title: e.title,
    riskScore: e.riskScore,
    riskLevel: riskLevelFromScore(e.riskScore),
    status: e.status as EnrichedEmployee["status"],
    managedDeviceId: e.managedDeviceId,
    lastSeenAt: e.lastSeenAt ? e.lastSeenAt.toISOString() : null,
    lastKnownIp: e.lastKnownIp,
    createdAt: e.createdAt.toISOString(),
    offboardedAt: e.offboardedAt ? e.offboardedAt.toISOString() : null,
  }));
}

export default async function UsersPage() {
  const employees = await loadEmployees();
  const highSeverityAlertCount = await prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } });
  const riskScore = employees.length
    ? Math.round(employees.reduce((sum, e) => sum + e.riskScore, 0) / employees.length)
    : 0;

  return (
    <div className="flex min-h-full flex-col">
      <Header title="IAM Employee Lifecycle Management" highSeverityAlertCount={highSeverityAlertCount} riskScore={riskScore} />
      <div className="p-6">
        <EmployeeTable initialEmployees={employees} />
      </div>
    </div>
  );
}
