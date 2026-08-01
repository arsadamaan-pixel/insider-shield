"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function getNextParam(): string {
  if (typeof window === "undefined") return "/";
  return new URLSearchParams(window.location.search).get("next") || "/";
}

// The shared-token login form — only rendered when Google Sign-In isn't
// configured for this deployment (see src/app/login/page.tsx). Logic
// unchanged from before the Google Sign-In split.
export function TokenLoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [operator, setOperator] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, operator }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);

      router.push(getNextParam());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="token" className="mb-1 block text-xs text-slate-500">
        Access token
      </label>
      <input
        id="token"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="mb-4 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
      />

      <label htmlFor="operator" className="mb-1 block text-xs text-slate-500">
        Your name or email (optional)
      </label>
      <input
        id="operator"
        type="text"
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
        placeholder="used to attribute your actions in the audit trail"
        className="mb-4 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
      />

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
