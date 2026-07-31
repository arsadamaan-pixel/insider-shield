"use client";

import { useEffect, useState } from "react";
import type { ConnectedAgent } from "@/types";

interface RenameEndpointModalProps {
  agent: ConnectedAgent;
  onClose: () => void;
  onRenamed: (key: string, deviceName: string) => void;
}

export function RenameEndpointModal({ agent, onClose, onRenamed }: RenameEndpointModalProps) {
  const [deviceName, setDeviceName] = useState(agent.deviceName ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = deviceName.trim();
    if (!trimmed) {
      setError("device name can't be empty");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/agents/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: agent.tokenId, deviceName: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      onRenamed(agent.key, trimmed);
      onClose();
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
      aria-labelledby="rename-endpoint-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="rename-endpoint-modal-title" className="text-sm font-semibold text-slate-100">
          Rename device
        </h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="deviceName" className="mt-3 block text-xs text-slate-500">
            Device name
          </label>
          <input
            id="deviceName"
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            maxLength={100}
            autoFocus
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          />
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
