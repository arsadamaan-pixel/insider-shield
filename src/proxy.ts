import { NextResponse, type NextRequest } from "next/server";
import { hasValidDashboardSession } from "@/lib/auth";

// Next 16 renamed `middleware.ts` to `proxy.ts` (middleware is
// deprecated) — confirmed against node_modules/next/dist/docs, which
// has no middleware.md at all, only proxy.md. Runs on the Node.js
// runtime by default (not edge) so src/lib/auth.ts's built-in `crypto`
// usage is safe here.
//
// Gates the entire dashboard (every page + every remaining /api/*
// route) behind the session cookie, regardless of which login method
// produced it (shared token or Google Sign-In). Exclusions:
// /login, /api/auth/login, and /api/auth/google/{login,callback} (the
// credential-entry surface itself — the Google routes obviously can't
// require a session cookie to reach them, since reaching them is how
// one gets issued), /api/telemetry (agent traffic, gated by
// ORG_ACCESS_KEY instead inside
// that route — a blanket dashboard-session check here would incorrectly
// reject legitimate agent requests), and /api/health (Phase 7 — a
// container platform's healthcheck, e.g. Render or `docker
// HEALTHCHECK`, can't present a session cookie; the route itself
// reveals only aggregate connection counts, never employee/alert data).
//
// /api/ws is not excluded because it doesn't need to be: WebSocket
// upgrade requests fire Node's 'upgrade' event, never the 'request'
// event this proxy hooks into, so it's structurally unreachable here
// regardless of the matcher — server.ts's own checks are the sole gate
// for that surface, not defense-in-depth on top of this file.

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/google/login",
  "/api/auth/google/callback",
  "/api/health",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/telemetry")) {
    return NextResponse.next();
  }

  if (hasValidDashboardSession(request.headers.get("cookie"))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
