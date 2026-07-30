import { Header } from "@/components/layout/Header";
import { generateDashboardSnapshot } from "@/lib/mockData";
import { getPolicy } from "@/lib/policyStore";

// Reads live policy state from SQLite (changes via POST /api/policies) —
// must not be frozen as a build-time static snapshot.
export const dynamic = "force-dynamic";

// Placeholder — read-only view of the current OTA policy. An editing UI
// (with an audit trail) is Phase 4 work; for now, POST /api/policies is
// the only way to change it.
export default async function PoliciesPage() {
  const { highSeverityAlertCount, riskScore } = generateDashboardSnapshot();
  const policy = await getPolicy();

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Remote OTA Policy Distribution" highSeverityAlertCount={highSeverityAlertCount} riskScore={riskScore} />
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">DLP Detection</p>
            <p className={`text-lg font-semibold ${policy.dlpEnabled ? "text-emerald-400" : "text-slate-400"}`}>
              {policy.dlpEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-500">Telemetry Transmission (kill switch)</p>
            <p className={`text-lg font-semibold ${policy.transmitEvents ? "text-amber-400" : "text-slate-400"}`}>
              {policy.transmitEvents ? "ON" : "OFF (default)"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="mb-2 text-xs text-slate-500">Sensitive Patterns</p>
          <ul className="flex flex-col gap-1 font-mono text-xs text-slate-400">
            {policy.sensitivePatterns.map((rule) => (
              <li key={rule.name}>
                <span className="text-slate-300">{rule.name}</span>: {rule.pattern}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
            Heartbeat interval: <span className="text-slate-200">{policy.heartbeatIntervalMs}ms</span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
            WS endpoint: <span className="font-mono text-slate-200">{policy.wsEndpoint}</span>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Last updated: {new Date(policy.updatedAt).toLocaleString()} — updates go through{" "}
          <code className="rounded bg-slate-900 px-1 py-0.5">POST /api/policies</code>, validated against an
          allow-listed field set (see <code className="rounded bg-slate-900 px-1 py-0.5">src/app/api/policies/route.ts</code>).
        </p>
      </div>
    </div>
  );
}
