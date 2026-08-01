"use client";

import { useEffect, useState } from "react";
import type { EnrichedEmployee } from "@/types";

interface DeleteEmployeeModalProps {
  employee: EnrichedEmployee;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function DeleteEmployeeModal({ employee, onClose, onDeleted }: DeleteEmployeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deletedHeartbeats: number; terminatedSessions: number } | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employee.id}/delete`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      setResult({ deletedHeartbeats: body.deletedHeartbeats ?? 0, terminatedSessions: body.terminatedSessions ?? 0 });
      onDeleted(employee.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-employee-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-employee-modal-title" className="text-sm font-semibold text-slate-100">
          Permanently delete {employee.name}?
        </h2>

        {result === null ? (
          <>
            <p className="mt-2 text-xs text-slate-400">
              This permanently removes <span className="text-slate-300">{employee.email}</span> from the employee
              list and deletes their heartbeat/telemetry history. Any live session is force-closed. DLP alert and
              audit trail history for this person is kept for compliance and is not deleted.
            </p>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
              >
                {loading ? "Deleting…" : "Confirm Delete"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Deleted. {result.deletedHeartbeats} heartbeat record{result.deletedHeartbeats === 1 ? "" : "s"} removed
              {result.terminatedSessions > 0
                ? `, ${result.terminatedSessions} active session${result.terminatedSessions === 1 ? "" : "s"} terminated.`
                : "."}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
