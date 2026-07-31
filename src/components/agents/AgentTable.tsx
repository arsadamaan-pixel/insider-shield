"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { DeleteEndpointModal } from "@/components/agents/DeleteEndpointModal";
import { RenameEndpointModal } from "@/components/agents/RenameEndpointModal";
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

export function AgentTable({ agents: initialAgents }: { agents: ConnectedAgent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [prevInitialAgents, setPrevInitialAgents] = useState(initialAgents);
  const [renameTarget, setRenameTarget] = useState<ConnectedAgent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectedAgent | null>(null);

  // Unlike EmployeeTable.tsx (its parent page has no live-refresh
  // source), this table's parent re-renders on every EndpointsLiveSync
  // router.refresh() with a freshly computed `agents` array — useState's
  // initial value alone would freeze the table at first mount and never
  // pick those up, even though the metric cards above it (read directly
  // from the server component's own render) would keep updating.
  // Resyncing during render (React's documented pattern for this,
  // https://react.dev/learn/you-might-not-need-an-effect) instead of in
  // a useEffect avoids an extra commit/cascading render on every refresh.
  if (initialAgents !== prevInitialAgents) {
    setPrevInitialAgents(initialAgents);
    setAgents(initialAgents);
  }

  function handleRenamed(key: string, deviceName: string) {
    setAgents((prev) => prev.map((a) => (a.key === key ? { ...a, deviceName } : a)));
  }

  function handleDeleted(key: string) {
    setAgents((prev) => prev.filter((a) => a.key !== key));
  }

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
              <th className="px-4 py-2 font-medium" />
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
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    {agent.tokenId && (
                      <button
                        type="button"
                        onClick={() => setRenameTarget(agent)}
                        title="Rename device"
                        className="rounded-md border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(agent)}
                      title="Permanently delete endpoint"
                      className="rounded-md border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                  No endpoint agents have reported in the last 24 hours. Generate a token on the Agent
                  Provisioning page and configure an extension with it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renameTarget && (
        <RenameEndpointModal agent={renameTarget} onClose={() => setRenameTarget(null)} onRenamed={handleRenamed} />
      )}
      {deleteTarget && (
        <DeleteEndpointModal agent={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
      )}
    </div>
  );
}
