import { Header } from "@/components/layout/Header";
import { AgentTable } from "@/components/agents/AgentTable";
import { AutoRefresh } from "@/components/agents/AutoRefresh";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { listConnectedAgents } from "@/lib/agents";
import { prisma } from "@/lib/prisma";
import { Activity, Wifi, WifiOff } from "lucide-react";

// Reads live agent/heartbeat state plus the in-process WebSocket
// registry — must not be frozen as a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function EndpointsPage() {
  const [agents, highSeverityAlertCount, riskAvg] = await Promise.all([
    listConnectedAgents(),
    prisma.dlpAlert.count({ where: { severity: { in: ["high", "critical"] } } }),
    prisma.employee.aggregate({ _avg: { riskScore: true } }),
  ]);

  const online = agents.filter((a) => a.status === "online").length;
  const offline = agents.filter((a) => a.status === "offline").length;
  const totalPings = agents.reduce((sum, a) => sum + a.heartbeatCount, 0);

  return (
    <div className="flex min-h-full flex-col">
      <Header
        title="Endpoint Agents"
        highSeverityAlertCount={highSeverityAlertCount}
        riskScore={Math.round(riskAvg._avg.riskScore ?? 0)}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Agents Online" value={online} icon={Wifi} />
          <MetricCard label="Agents Offline" value={offline} icon={WifiOff} tone="warning" />
          <MetricCard label="Heartbeats (24h)" value={totalPings} icon={Activity} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Agents that have reported in the last 24 hours, whether or not their identity matches a
              known employee.
            </p>
            <AutoRefresh />
          </div>
          <AgentTable agents={agents} />
        </div>
      </div>
    </div>
  );
}
