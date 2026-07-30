"use client";

import { useCallback, useMemo, useState } from "react";
import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { useWebSocket } from "@/lib/useWebSocket";
import { AUDIT_ACTIONS } from "@/types";
import type { AuditAction, AuditLogEntry, ServerToDashboardMessage } from "@/types";

const MAX_LOGS = 200;

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  open: "Live",
  closed: "Reconnecting…",
};

export function LiveAuditTrail({ initialLogs }: { initialLogs: AuditLogEntry[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");

  const handleMessage = useCallback((message: ServerToDashboardMessage) => {
    if (message.type !== "audit_log") return;
    setLogs((prev) => [message.entry, ...prev.filter((l) => l.id !== message.entry.id)].slice(0, MAX_LOGS));
  }, []);

  const { status } = useWebSocket({ role: "dashboard", onMessage: handleMessage });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!q) return true;
      const haystack = `${log.actorEmail} ${log.action} ${log.targetResource}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, query, actionFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actor, action, or target…"
            className="w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "all" | AuditAction)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          >
            <option value="all">All actions</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-emerald-400" : "bg-slate-600"}`} />
          {STATUS_LABEL[status]}
        </div>
      </div>

      <AuditLogTable logs={filtered} />
    </div>
  );
}
