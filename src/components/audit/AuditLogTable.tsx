import type { AuditLogEntry } from "@/types";

const ACTION_STYLES: Record<string, string> = {
  policy_update: "bg-amber-500/15 text-amber-400",
  employee_revoked: "bg-red-500/15 text-red-400",
  dlp_event_ingested: "bg-orange-500/15 text-orange-400",
  login_succeeded: "bg-emerald-500/15 text-emerald-400",
  login_failed: "bg-red-500/15 text-red-400",
  agent_auth_failed: "bg-red-500/15 text-red-400",
  dashboard_auth_failed: "bg-red-500/15 text-red-400",
  provisioning_token_created: "bg-emerald-500/15 text-emerald-400",
  provisioning_token_revoked: "bg-red-500/15 text-red-400",
  endpoint_deleted: "bg-red-500/15 text-red-400",
  endpoint_renamed: "bg-amber-500/15 text-amber-400",
};

const DEFAULT_ACTION_STYLE = "bg-slate-700/40 text-slate-300";

function formatTime(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDetails(details: unknown) {
  if (details === null || details === undefined) return "—";
  try {
    return JSON.stringify(details);
  } catch {
    return "—";
  }
}

export function AuditLogTable({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Audit Trail</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-800/60 text-slate-300">
                <td className="px-4 py-2 text-slate-500">{formatTime(log.timestamp)}</td>
                <td className="px-4 py-2">{log.actorEmail}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[log.action] ?? DEFAULT_ACTION_STYLE}`}
                  >
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{log.targetResource}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{log.ipAddress ?? "—"}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-slate-500" title={formatDetails(log.details)}>
                  {formatDetails(log.details)}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No audit log entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
