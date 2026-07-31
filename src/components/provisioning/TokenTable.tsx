"use client";

import { useState } from "react";
import type { ProvisioningToken } from "@/types";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  revoked: "bg-slate-700/40 text-slate-400",
  expired: "bg-amber-500/15 text-amber-400",
};

function effectiveStatus(token: ProvisioningToken): "active" | "revoked" | "expired" {
  if (token.status === "revoked") return "revoked";
  if (token.isExpired) return "expired";
  return "active";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TokenTableProps {
  tokens: ProvisioningToken[];
  onRevoked: (id: string) => void;
}

export function TokenTable({ tokens, onRevoked }: TokenTableProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/provision-token/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
      onRevoked(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Active Provisioning Keys</h2>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Device / Employee</th>
              <th className="px-4 py-2 font-medium">Token ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Issued</th>
              <th className="px-4 py-2 font-medium">Last Used</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const status = effectiveStatus(token);
              return (
                <tr key={token.id} className="border-t border-slate-800/60 text-slate-300">
                  <td className="px-4 py-2">
                    <div>{token.deviceName ?? "Unnamed device"}</div>
                    {token.employeeName && <div className="text-xs text-slate-500">{token.employeeName}</div>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{token.tokenPrefix}…</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(token.createdAt)}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(token.lastUsedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(token.id)}
                      disabled={status !== "active" || revokingId === token.id}
                      className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {revokingId === token.id ? "Revoking…" : "Revoke Token"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {tokens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No provisioning tokens yet — generate one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
