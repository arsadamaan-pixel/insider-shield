"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/useWebSocket";
import type { ServerToDashboardMessage } from "@/types";

// Replaces the old 15s AutoRefresh poll with WS-push: server.ts's
// wsRegistry broadcasts "agents_changed" the instant an agent connects
// or disconnects (see src/lib/wsRegistry.ts's registerConnection()),
// and the delete/rename admin routes broadcast the same event — so this
// component re-fetches via router.refresh() right after any of those,
// instead of on a fixed timer.
//
// Two things this can't make instant, by design: the clock-driven
// online->stale->offline aging in listConnectedAgents()'s deriveStatus()
// isn't an event (nothing "happens" when 90s of silence elapses), and a
// missed WS message is always possible over an unreliable network. The
// slow safety-net poll below covers both — much less often than the old
// 15s poll, since it's a fallback now, not the primary mechanism.
const SAFETY_NET_POLL_MS = 60000;
const DEBOUNCE_MS = 1500;

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function EndpointsLiveSync() {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMessage = useCallback(
    (message: ServerToDashboardMessage) => {
      if (message.type !== "agents_changed" || paused) return;
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    },
    [router, paused]
  );

  const { status } = useWebSocket({ role: "dashboard", onMessage: handleMessage });

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => router.refresh(), SAFETY_NET_POLL_MS);
    return () => clearInterval(timer);
  }, [router, paused]);

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={!paused}
          onChange={(e) => setPaused(!e.target.checked)}
          className="h-3 w-3"
        />
        Live sync
      </label>
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-emerald-400" : "bg-slate-600"}`} />
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
