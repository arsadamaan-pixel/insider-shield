import type { DlpAlert } from "@/types";

const SEVERITY_STYLES: Record<DlpAlert["severity"], string> = {
  low: "bg-slate-700/40 text-slate-300",
  medium: "bg-amber-500/15 text-amber-400",
  high: "bg-orange-500/15 text-orange-400",
  critical: "bg-red-500/15 text-red-400",
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IncidentFeedTable({ alerts }: { alerts: DlpAlert[] }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Live Incident Feed</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Rule</th>
              <th className="px-4 py-2 font-medium">Host</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Geo</th>
              <th className="px-4 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-t border-slate-800/60 text-slate-300">
                <td className="px-4 py-2">{alert.employeeName}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{alert.ruleName}</td>
                <td className="px-4 py-2 text-slate-400">{alert.hostname}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[alert.severity]}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {alert.geoViolation ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                      violation
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{formatTime(alert.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
