import { Header } from "@/components/layout/Header";
import { PolicyControlPanel } from "@/components/policies/PolicyControlPanel";
import { generateDashboardSnapshot } from "@/lib/mockData";
import { getPolicy } from "@/lib/policyStore";

// Reads live policy state from SQLite (changes via POST /api/policies or
// the WebSocket policy_update channel) — must not be frozen as a
// build-time static snapshot.
export const dynamic = "force-dynamic";

// dlpEnabled/transmitEvents/heartbeatIntervalMs are editable live via
// PolicyControlPanel (pushes over WS, REST fallback). sensitivePatterns
// and wsEndpoint stay read-only here — a fuller authoring UI for those
// is still Phase 4 work.
export default async function PoliciesPage() {
  const { highSeverityAlertCount, riskScore } = generateDashboardSnapshot();
  const policy = await getPolicy();

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Remote OTA Policy Distribution" highSeverityAlertCount={highSeverityAlertCount} riskScore={riskScore} />
      <div className="flex flex-col gap-4 p-6">
        <PolicyControlPanel initialPolicy={policy} />

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

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          WS endpoint: <span className="font-mono text-slate-200">{policy.wsEndpoint}</span>
        </div>

        <p className="text-xs text-slate-600">
          Last updated: {new Date(policy.updatedAt).toLocaleString()} — updates go through{" "}
          <code className="rounded bg-slate-900 px-1 py-0.5">POST /api/policies</code> or the{" "}
          <code className="rounded bg-slate-900 px-1 py-0.5">policy_update</code> WebSocket channel, both validated
          against the same allow-listed field set (see{" "}
          <code className="rounded bg-slate-900 px-1 py-0.5">src/lib/policyStore.ts</code>).
        </p>
      </div>
    </div>
  );
}
