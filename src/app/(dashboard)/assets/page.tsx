import { Header } from "@/components/layout/Header";
import { AssetMap } from "@/components/assets/AssetMap";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeGeo } from "@/lib/geo";
import type { AssetEndpoint } from "@/types";

// Reads live employee/heartbeat/alert state from SQLite — must not be
// frozen as a build-time snapshot.
export const dynamic = "force-dynamic";

async function loadAssets(): Promise<AssetEndpoint[]> {
  const employees = await prisma.employee.findMany({ where: { managedDeviceId: { not: null } } });

  const [violations, heartbeats] = await Promise.all([
    // Compliance is derived from real, already-persisted data: an
    // endpoint is a violation if its employee has any unacknowledged
    // geo-violating DLP alert — not a synthetic flag.
    prisma.dlpAlert.findMany({ where: { geoViolation: true, acknowledged: false }, select: { employeeEmail: true } }),
    prisma.heartbeat.findMany({ where: { employeeEmail: { not: null } }, orderBy: { timestamp: "desc" } }),
  ]);

  const violatingEmails = new Set(violations.map((v) => v.employeeEmail));

  const latestByEmail = new Map<string, string | null>();
  for (const hb of heartbeats) {
    if (!hb.employeeEmail || latestByEmail.has(hb.employeeEmail)) continue;
    let os: string | null = null;
    try {
      os = (JSON.parse(hb.platform) as { os?: string }).os ?? null;
    } catch {
      os = null;
    }
    latestByEmail.set(hb.employeeEmail, os);
  }

  return Promise.all(
    employees.map(async (employee) => {
      const { location, approximate } = await resolveEmployeeGeo(employee);
      return {
        id: employee.id,
        employeeName: employee.name,
        employeeEmail: employee.email,
        managedDeviceId: employee.managedDeviceId as string,
        location,
        approximate,
        compliant: !violatingEmails.has(employee.email),
        os: latestByEmail.get(employee.email) ?? null,
        ipAddress: employee.lastKnownIp,
        lastHeartbeat: employee.lastSeenAt ? employee.lastSeenAt.toISOString() : null,
      };
    })
  );
}

export default async function AssetsPage() {
  const [assets, highSeverityAlertCount, riskAvg] = await Promise.all([
    loadAssets(),
    prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } }),
    prisma.employee.aggregate({ _avg: { riskScore: true } }),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title="Geo-Compliance & Asset Map"
        highSeverityAlertCount={highSeverityAlertCount}
        riskScore={Math.round(riskAvg._avg.riskScore ?? 0)}
      />
      <div className="flex flex-col gap-4 p-6">
        <AssetMap assets={assets} />
      </div>
    </div>
  );
}
