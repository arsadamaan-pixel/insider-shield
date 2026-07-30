import { Header } from "@/components/layout/Header";
import { generateDashboardSnapshot } from "@/lib/mockData";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  suspended: "bg-amber-500/15 text-amber-400",
  offboarded: "bg-slate-700/40 text-slate-400",
};

const RISK_STYLES: Record<string, string> = {
  low: "bg-slate-700/40 text-slate-300",
  medium: "bg-amber-500/15 text-amber-400",
  high: "bg-orange-500/15 text-orange-400",
  critical: "bg-red-500/15 text-red-400",
};

// Placeholder listing view — full IAM lifecycle actions (suspend, offboard,
// bind managed device) are Phase 4 work per PLAN.md.
export default function UsersPage() {
  const { employees, highSeverityAlertCount, riskScore } = generateDashboardSnapshot();

  return (
    <div className="flex min-h-full flex-col">
      <Header title="IAM Employee Lifecycle Management" highSeverityAlertCount={highSeverityAlertCount} riskScore={riskScore} />
      <div className="p-6">
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="px-4 py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-t border-slate-800/60 text-slate-300">
                  <td className="px-4 py-2">
                    <div>{employee.fullName}</div>
                    <div className="text-xs text-slate-500">{employee.title}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-400">{employee.department}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[employee.status]}`}>
                      {employee.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_STYLES[employee.riskLevel]}`}>
                      {employee.riskLevel} ({employee.riskScore})
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {employee.managedDeviceId ?? "unbound"}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{employee.location.city}, {employee.location.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
