"use client";

import { useState } from "react";
import { OffboardModal } from "@/components/users/OffboardModal";
import type { EnrichedEmployee } from "@/types";

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

function formatLastSeen(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EmployeeTable({ initialEmployees }: { initialEmployees: EnrichedEmployee[] }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [target, setTarget] = useState<EnrichedEmployee | null>(null);

  function handleRevoked(updated: EnrichedEmployee) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Risk</th>
              <th className="px-4 py-2 font-medium">Device</th>
              <th className="px-4 py-2 font-medium">Last Seen</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-t border-slate-800/60 text-slate-300">
                <td className="px-4 py-2">
                  <div>{employee.name}</div>
                  {employee.title && <div className="text-xs text-slate-500">{employee.title}</div>}
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
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{employee.managedDeviceId ?? "unbound"}</td>
                <td className="px-4 py-2 text-slate-400">{formatLastSeen(employee.lastSeenAt)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setTarget(employee)}
                    disabled={employee.status === "offboarded"}
                    className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Offboard / Revoke Key
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && <OffboardModal employee={target} onClose={() => setTarget(null)} onRevoked={handleRevoked} />}
    </>
  );
}
