import { Header } from "@/components/layout/Header";
import { ProvisioningWorkspace } from "@/components/provisioning/ProvisioningWorkspace";
import { listProvisioningTokens } from "@/lib/agentTokens";
import { prisma } from "@/lib/prisma";

// Reads live token/employee state from SQLite — must not be frozen as a
// build-time static snapshot (same reasoning as the other dashboard
// pages — see PLAN.md's Phase 3 notes).
export const dynamic = "force-dynamic";

export default async function ProvisioningPage() {
  const [tokens, employees, highSeverityAlertCount, riskAvg] = await Promise.all([
    listProvisioningTokens(),
    prisma.employee.findMany({
      where: { status: "active" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } }),
    prisma.employee.aggregate({ _avg: { riskScore: true } }),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title="Agent Provisioning"
        highSeverityAlertCount={highSeverityAlertCount}
        riskScore={Math.round(riskAvg._avg.riskScore ?? 0)}
      />
      <div className="flex flex-col gap-6 p-6">
        <ProvisioningWorkspace
          initialTokens={tokens}
          employees={employees}
          extensionInstallUrl={process.env.EXTENSION_INSTALL_URL || null}
        />
      </div>
    </div>
  );
}
