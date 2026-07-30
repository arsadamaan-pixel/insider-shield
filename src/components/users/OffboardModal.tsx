"use client";

import { useEffect, useState } from "react";
import type { EnrichedEmployee } from "@/types";

interface OffboardModalProps {
  employee: EnrichedEmployee;
  onClose: () => void;
  onRevoked: (updated: EnrichedEmployee) => void;
}

export function OffboardModal({ employee, onClose, onRevoked }: OffboardModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminatedSessions, setTerminatedSessions] = useState<number | null>(null);

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
      const res = await fetch(`/api/employees/${employee.id}/revoke`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      onRevoked({ ...employee, status: "offboarded", offboardedAt: body.employee?.offboardedAt ?? new Date().toISOString() });
      setTerminatedSessions(body.terminatedSessions ?? 0);
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
      aria-labelledby="offboard-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="offboard-modal-title" className="text-sm font-semibold text-slate-100">
          Offboard {employee.name}?
        </h2>

        {terminatedSessions === null ? (
          <>
            <p className="mt-2 text-xs text-slate-400">
              This sets the employee&apos;s status to <span className="font-mono text-slate-300">offboarded</span>,
              force-terminates any active extension session for{" "}
              <span className="text-slate-300">{employee.email}</span>, and blocks future reconnects until access is
              restored.
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
                {loading ? "Revoking…" : "Confirm Revoke"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Revoked. {terminatedSessions} active session{terminatedSessions === 1 ? "" : "s"} terminated.
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
