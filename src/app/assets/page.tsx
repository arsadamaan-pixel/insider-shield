import { Header } from "@/components/layout/Header";
import { generateDashboardSnapshot } from "@/lib/mockData";

// Placeholder — the interactive Leaflet/React-Leaflet map (per CLAUDE.md
// stack) is Phase 4 work in PLAN.md. This lists the same mock geo data
// the map will eventually plot, so the route isn't a dead end.
export default function AssetsPage() {
  const { employees, highSeverityAlertCount, riskScore } = generateDashboardSnapshot();

  return (
    <div className="flex min-h-full flex-col">
      <Header title="Geo-Compliance & Asset Map" highSeverityAlertCount={highSeverityAlertCount} riskScore={riskScore} />
      <div className="flex flex-col gap-4 p-6">
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
          Interactive Leaflet / React-Leaflet map is planned for Phase 4.
          Below is the same mock geo dataset it will render.
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Endpoint</th>
                <th className="px-4 py-2 font-medium">City</th>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium">Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter((e) => e.managedDeviceId)
                .map((employee) => (
                  <tr key={employee.id} className="border-t border-slate-800/60 text-slate-300">
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{employee.managedDeviceId}</td>
                    <td className="px-4 py-2">{employee.location.city}</td>
                    <td className="px-4 py-2 text-slate-400">{employee.location.country}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {employee.location.lat.toFixed(2)}, {employee.location.lng.toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
