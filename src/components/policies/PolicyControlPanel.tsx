"use client";

import { useCallback, useState } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
import type { ServerToDashboardMessage, SystemPolicy } from "@/types";

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function PolicyControlPanel({ initialPolicy }: { initialPolicy: SystemPolicy }) {
  const [dlpEnabled, setDlpEnabled] = useState(initialPolicy.dlpEnabled);
  const [transmitEvents, setTransmitEvents] = useState(initialPolicy.transmitEvents);
  const [heartbeatIntervalMs, setHeartbeatIntervalMs] = useState(initialPolicy.heartbeatIntervalMs);
  const [saving, setSaving] = useState(false);
  const [savedVia, setSavedVia] = useState<"ws" | "rest" | null>(null);

  const handleMessage = useCallback((message: ServerToDashboardMessage) => {
    if (message.type !== "policy_update") return;
    setDlpEnabled(message.policy.dlpEnabled);
    setTransmitEvents(message.policy.transmitEvents);
    setHeartbeatIntervalMs(message.policy.heartbeatIntervalMs);
  }, []);

  const { status, send } = useWebSocket({ role: "dashboard", onMessage: handleMessage });

  async function handleSave() {
    setSaving(true);
    setSavedVia(null);
    const update = { dlpEnabled, transmitEvents, heartbeatIntervalMs };

    const sentOverWs = send({ type: "policy_update", policy: update, updatedBy: "dashboard-ui" });
    if (sentOverWs) {
      setSavedVia("ws");
      setSaving(false);
      return;
    }

    // WS not open — fall back to the REST endpoint so Save still works.
    try {
      await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...update, updatedBy: "dashboard-ui" }),
      });
      setSavedVia("rest");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">Policy Control Panel</p>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-emerald-400" : "bg-slate-600"}`} />
          {STATUS_LABEL[status]}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 p-3">
          <span className="text-sm text-slate-300">DLP Detection</span>
          <input
            type="checkbox"
            checked={dlpEnabled}
            onChange={(e) => setDlpEnabled(e.target.checked)}
            className="h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 p-3">
          <span className="text-sm text-slate-300">Telemetry Kill Switch</span>
          <input
            type="checkbox"
            checked={transmitEvents}
            onChange={(e) => setTransmitEvents(e.target.checked)}
            className="h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 p-3">
          <span className="text-sm text-slate-300">Heartbeat (ms)</span>
          <input
            type="number"
            min={1000}
            step={1000}
            value={heartbeatIntervalMs}
            onChange={(e) => setHeartbeatIntervalMs(Number(e.target.value))}
            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-slate-200"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Push Update"}
        </button>
        {savedVia && (
          <span className="text-xs text-slate-500">
            Pushed via {savedVia === "ws" ? "WebSocket" : "REST fallback"}
          </span>
        )}
      </div>
    </div>
  );
}
