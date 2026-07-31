import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentSockets, dashboardSockets } from "@/lib/wsRegistry";

// Unauthenticated on purpose (see src/proxy.ts's PUBLIC_PATHS) — a
// container platform's healthcheck (Render, Docker HEALTHCHECK, etc.)
// can't present a dashboard session cookie or the agent org-access key.
// Reveals only aggregate connection counts, never any employee/alert
// data, so it's safe to leave open.
//
// WS status is read from src/lib/wsRegistry.ts's globalThis-cached
// registry — this route handler runs in the same Node process as
// server.ts's custom http server (both are the one process `tsx
// server.ts` starts), so it's genuinely live state, not a guess.

export async function GET() {
  const startedAt = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "unknown error";
  }

  const body = {
    status: dbStatus === "ok" ? "ok" : "error",
    db: {
      status: dbStatus,
      ...(dbError ? { error: dbError } : {}),
      latencyMs: Date.now() - startedAt,
    },
    ws: {
      agentConnections: agentSockets.size,
      dashboardConnections: dashboardSockets.size,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbStatus === "ok" ? 200 : 503 });
}
