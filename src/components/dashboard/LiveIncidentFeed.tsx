"use client";

import { useCallback, useState } from "react";
import { IncidentFeedTable } from "@/components/dashboard/IncidentFeedTable";
import { useWebSocket } from "@/lib/useWebSocket";
import type { DlpAlert, ServerToDashboardMessage } from "@/types";

const MAX_ALERTS = 20;

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function LiveIncidentFeed({ initialAlerts }: { initialAlerts: DlpAlert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);

  const handleMessage = useCallback((message: ServerToDashboardMessage) => {
    if (message.type !== "dlp_alert") return;
    setAlerts((prev) => [message.alert, ...prev.filter((a) => a.id !== message.alert.id)].slice(0, MAX_ALERTS));
  }, []);

  const { status } = useWebSocket({ role: "dashboard", onMessage: handleMessage });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
        <span
          className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-emerald-400" : "bg-slate-600"}`}
        />
        {STATUS_LABEL[status]}
      </div>
      <IncidentFeedTable alerts={alerts} />
    </div>
  );
}
