"use client";

import { useState } from "react";
import { KeyRound, Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";
import type { NewProvisioningToken, ProvisioningEmployeeOption, ProvisioningToken } from "@/types";

const EXPIRATION_OPTIONS = [
  { label: "Never expires", value: "" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "365 days", value: "365" },
];

function maskToken(raw: string): string {
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 8)}${"•".repeat(16)}${raw.slice(-4)}`;
}

interface TokenGeneratorCardProps {
  employees: ProvisioningEmployeeOption[];
  onGenerated: (token: ProvisioningToken) => void;
}

export function TokenGeneratorCard({ employees, onGenerated }: TokenGeneratorCardProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [expirationDays, setExpirationDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<NewProvisioningToken | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setIssued(null);
    setQrDataUrl(null);
    setRevealed(false);
    setCopied(false);
    setUrlCopied(false);

    try {
      const res = await fetch("/api/admin/provision-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employeeId || undefined,
          deviceName: deviceName.trim() || undefined,
          expirationDays: expirationDays ? Number(expirationDays) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      const newToken = body as NewProvisioningToken;
      setIssued(newToken);

      const employee = employees.find((e) => e.id === newToken.employeeId);
      onGenerated({
        id: newToken.id,
        tokenPrefix: newToken.tokenPrefix,
        employeeId: newToken.employeeId,
        employeeName: employee?.name ?? null,
        deviceName: newToken.deviceName,
        status: "active",
        isExpired: false,
        createdBy: null,
        createdAt: newToken.createdAt,
        expiresAt: newToken.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      });

      // Quick-guide QR: what a device needs to provision itself with
      // this token. There's no scan-to-configure flow in the extension
      // yet (see extension/options/options.html) — this is a
      // copy/reference aid for whoever's setting the device up, not a
      // functioning auto-provisioning channel.
      const qrPayload = JSON.stringify({
        orgAccessKey: newToken.token,
        wsEndpoint: newToken.wsUrl,
      });
      QRCode.toDataURL(qrPayload, { width: 160, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyUrl() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.wsUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-emerald-400" />
        <p className="text-sm font-semibold text-slate-200">One-Click Token Generator</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Employee (optional)</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.email})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Device name (optional)</span>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Amara's MacBook"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Expiration</span>
          <select
            value={expirationDays}
            onChange={(e) => setExpirationDays(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
          >
            {EXPIRATION_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate Agent Token"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {issued && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <p className="text-xs text-emerald-400">
              Token generated — copy it now. It will never be shown again after you leave this page.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-slate-950 px-2 py-1 font-mono text-xs text-slate-300">
                {revealed ? issued.token : maskToken(issued.token)}
              </code>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="text-xs text-slate-400 underline hover:text-slate-200"
              >
                {revealed ? "hide" : "reveal"}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">Server URL:</span>
              <code className="rounded bg-slate-950 px-2 py-1 font-mono text-xs text-slate-300">{issued.wsUrl}</code>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                {urlCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {urlCopied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">
              Paste this into the extension&apos;s options page &quot;Server URL&quot; field — only needed if the
              device isn&apos;t using the default <code>ws://localhost:3000/api/ws</code>.
            </p>
          </div>

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-1">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <QrCode className="h-3 w-3" /> Quick guide
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image can't optimize it */}
              <img src={qrDataUrl} alt="Provisioning QR code" width={112} height={112} className="rounded bg-white p-1" />
              <p className="max-w-[140px] text-center text-[10px] leading-tight text-slate-600">
                Open the extension&apos;s options page and paste this token into the &quot;Org Access Key&quot; field.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
