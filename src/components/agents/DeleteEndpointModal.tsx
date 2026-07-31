"use client";

import { useEffect, useState } from "react";
import type { ConnectedAgent } from "@/types";

interface DeleteEndpointModalProps {
  agent: ConnectedAgent;
  onClose: () => void;
  onDeleted: (key: string) => void;
}

export function DeleteEndpointModal({ agent, onClose, onDeleted }: DeleteEndpointModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deletedHeartbeats: number; tokenRevoked: boolean } | null>(null);

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
      const res = await fetch("/api/admin/agents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: agent.tokenId ?? undefined, employeeEmail: agent.employeeEmail ?? undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      setResult({ deletedHeartbeats: body.deletedHeartbeats ?? 0, tokenRevoked: Boolean(body.tokenRevoked) });
      onDeleted(agent.key);
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
      aria-labelledby="delete-endpoint-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-endpoint-modal-title" className="text-sm font-semibold text-slate-100">
          Permanently delete {agent.deviceName ?? "this endpoint"}?
        </h2>

        {result === null ? (
          <>
            <p className="mt-2 text-xs text-slate-400">
              This permanently deletes all heartbeat history for this endpoint.{" "}
              {agent.tokenId ? (
                <>Its provisioning token will also be revoked, so it cannot silently reappear.</>
              ) : (
                <>
                  This device authenticated with the shared org access key, not a per-device token — there is nothing
                  to revoke, so it can reappear if it sends another heartbeat.
                </>
              )}
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
              {result.tokenRevoked ? ", token revoked." : "."}
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
