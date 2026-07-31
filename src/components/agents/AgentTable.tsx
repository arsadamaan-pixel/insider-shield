import type { AgentStatus, ConnectedAgent } from "@/types";

const STATUS_STYLES: Record<AgentStatus, string> = {
  online: "bg-emerald-500/15 text-emerald-400",
  stale: "bg-amber-500/15 text-amber-400",
  offline: "bg-slate-700/40 text-slate-400",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  online: "bg-emerald-400",
  stale: "bg-amber-400",
  offline: "bg-slate-600",
};

function formatLastSeen(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function AgentTable({ agents }: { agents: ConnectedAgent[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Endpoint Agents</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Platform</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Last Seen</th>
              <th className="px-4 py-2 font-medium">Pings</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.key} className="border-t border-slate-800/60 text-slate-300">
                <td className="px-4 py-2">
                  <div>{agent.deviceName ?? "Unnamed device"}</div>
                  {agent.tokenPrefix && (
                    <div className="font-mono text-xs text-slate-500">{agent.tokenPrefix}…</div>
                  )}
                  {!agent.tokenId && (
                    <div className="text-xs text-slate-600">shared org key (no per-device token)</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {agent.employeeName ? (
                    <>
                      <div>{agent.employeeName}</div>
                      <div className="text-xs text-slate-500">{agent.employeeEmail}</div>
                    </>
                  ) : agent.employeeEmail ? (
                    <>
                      <div className="text-slate-400">{agent.employeeEmail}</div>
                      <div className="text-xs text-amber-500/80">not a known employee</div>
                    </>
                  ) : (
                    <span className="text-slate-600">unattributed</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {agent.platform ? `${agent.platform.os} / ${agent.platform.arch}` : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{agent.ipAddress ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[agent.status]}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                    {agent.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">{formatLastSeen(agent.lastSeenAt)}</td>
                <td className="px-4 py-2 text-slate-500">{agent.heartbeatCount}</td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  No endpoint agents have reported in the last 24 hours. Generate a token on the Agent
                  Provisioning page and configure an extension with it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
