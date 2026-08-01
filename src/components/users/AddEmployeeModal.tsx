"use client";

import { useEffect, useState } from "react";
import { riskLevelFromScore } from "@/lib/risk";
import type { EnrichedEmployee } from "@/types";

interface AddEmployeeModalProps {
  onClose: () => void;
  onCreated: (employee: EnrichedEmployee) => void;
}

export function AddEmployeeModal({ onClose, onCreated }: AddEmployeeModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [riskScore, setRiskScore] = useState("10");
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          department: department.trim(),
          title: title.trim() || undefined,
          riskScore: Number(riskScore),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      onCreated({
        id: body.id,
        name: body.name,
        email: body.email,
        department: body.department,
        title: body.title,
        riskScore: body.riskScore,
        riskLevel: riskLevelFromScore(body.riskScore),
        status: body.status,
        managedDeviceId: null,
        lastSeenAt: null,
        lastKnownIp: null,
        createdAt: body.createdAt,
        offboardedAt: null,
      });
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
      aria-labelledby="add-employee-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-employee-modal-title" className="text-sm font-semibold text-slate-100">
          Add Employee
        </h2>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Department</span>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Title (optional)</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Risk score (0-100)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={riskScore}
              onChange={(e) => setRiskScore(e.target.value)}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
            />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
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
              {loading ? "Adding…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
