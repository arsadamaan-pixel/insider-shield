"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { OffboardModal } from "@/components/users/OffboardModal";
import { AddEmployeeModal } from "@/components/users/AddEmployeeModal";
import { EditEmployeeModal } from "@/components/users/EditEmployeeModal";
import { DeleteEmployeeModal } from "@/components/users/DeleteEmployeeModal";
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
  const [offboardTarget, setOffboardTarget] = useState<EnrichedEmployee | null>(null);
  const [editTarget, setEditTarget] = useState<EnrichedEmployee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedEmployee | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  function handleRevoked(updated: EnrichedEmployee) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleCreated(created: EnrichedEmployee) {
    setEmployees((prev) => [created, ...prev]);
  }

  function handleUpdated(updated: EnrichedEmployee) {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleDeleted(id: string) {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Employee
        </button>
      </div>

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
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditTarget(employee)}
                      disabled={employee.status === "offboarded"}
                      title="Edit employee"
                      className="rounded-md border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOffboardTarget(employee)}
                      disabled={employee.status === "offboarded"}
                      className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Offboard / Revoke Key
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(employee)}
                      title="Permanently delete employee"
                      className="rounded-md border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onCreated={handleCreated} />}
      {editTarget && (
        <EditEmployeeModal employee={editTarget} onClose={() => setEditTarget(null)} onUpdated={handleUpdated} />
      )}
      {offboardTarget && (
        <OffboardModal employee={offboardTarget} onClose={() => setOffboardTarget(null)} onRevoked={handleRevoked} />
      )}
      {deleteTarget && (
        <DeleteEmployeeModal employee={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
      )}
    </>
  );
}
