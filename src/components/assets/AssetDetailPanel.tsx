import type { AssetEndpoint } from "@/types";

function formatHeartbeat(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AssetDetailPanel({ asset, onClose }: { asset: AssetEndpoint | null; onClose: () => void }) {
  if (!asset) {
    return (
      <div className="flex h-[28rem] items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
        Select a marker to see device details.
      </div>
    );
  }

  return (
    <div className="flex h-[28rem] flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">{asset.employeeName}</p>
          <p className="text-xs text-slate-500">{asset.employeeEmail}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>

      <span
        className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
          asset.compliant ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
        }`}
      >
        {asset.compliant ? "Compliant" : "Geofence / IP Violation"}
      </span>

      <dl className="grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-slate-500">Device</dt>
        <dd className="font-mono text-slate-300">{asset.managedDeviceId}</dd>

        <dt className="text-slate-500">OS</dt>
        <dd className="text-slate-300">{asset.os ?? "unknown"}</dd>

        <dt className="text-slate-500">IP</dt>
        <dd className="font-mono text-slate-300">{asset.ipAddress ?? "unknown"}</dd>

        <dt className="text-slate-500">Last heartbeat</dt>
        <dd className="text-slate-300">{formatHeartbeat(asset.lastHeartbeat)}</dd>

        <dt className="text-slate-500">Location</dt>
        <dd className="text-slate-300">
          {asset.location.city}, {asset.location.country}
          {asset.approximate && (
            <span className="ml-1.5 text-amber-500/80">(approximate — no GeoIP match)</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
