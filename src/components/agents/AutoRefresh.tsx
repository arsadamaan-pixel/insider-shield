"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Re-runs the server component on an interval so agent status/last-seen
// stay current without a manual reload.
//
// Deliberately a poll rather than the WebSocket channel the Incident
// Feed and Audit Trail use: heartbeats already arrive every ~20s per
// agent, and broadcasting each one to every open dashboard would
// multiply that traffic for data whose only visible effect is a
// relative timestamp ticking. router.refresh() re-fetches on the server
// and patches the tree in place — no full page reload, no lost scroll.
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, paused]);

  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={!paused}
        onChange={(e) => setPaused(!e.target.checked)}
        className="h-3 w-3"
      />
      Auto-refresh
    </label>
  );
}
