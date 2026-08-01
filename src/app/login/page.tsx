import { ShieldAlert } from "lucide-react";
import { TokenLoginForm } from "@/components/auth/TokenLoginForm";
import { isGoogleAuthConfigured } from "@/lib/googleAuth";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "Your Google account isn't authorized for this dashboard.",
  oauth_failed: "Google sign-in failed — please try again.",
  not_configured: "Google Sign-In isn't fully configured on this deployment.",
  rate_limited: "Too many attempts — try again in a few minutes.",
};

// Server Component so the choice of login method (Google vs. the
// shared-token form) is made from real server-side config
// (GOOGLE_CLIENT_ID/SECRET), not guessed client-side — see
// src/lib/googleAuth.ts. Once an org configures Google Sign-In, the
// token form is not merely hidden but never rendered at all for that
// deployment.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const googleConfigured = isGoogleAuthConfigured();
  // Same open-redirect guard as the login route itself applies before
  // storing this in a cookie — kept here too since this value also gets
  // interpolated directly into the Google Sign-In link's href.
  const nextParam = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed — please try again.") : null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-6 flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-emerald-400" />
          <span className="text-sm font-semibold tracking-wide text-slate-100">INSIDER-SHIELD</span>
        </div>
        <h1 className="mb-4 text-lg font-semibold text-slate-100">SOC Dashboard Login</h1>

        {errorMessage && (
          <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorMessage}</p>
        )}

        {googleConfigured ? (
          <a
            href={`/api/auth/google/login?next=${encodeURIComponent(nextParam)}`}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25"
          >
            Sign in with Google
          </a>
        ) : (
          <TokenLoginForm />
        )}
      </div>
    </div>
  );
}
