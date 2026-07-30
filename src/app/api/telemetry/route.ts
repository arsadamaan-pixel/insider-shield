import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestDlpEvent, ingestHeartbeat, isValidDlpEvent, isValidHeartbeat } from "@/lib/telemetryIngest";
import { getClientIp } from "@/lib/auth";
import { requireDashboardSession, requireOrgAccessKey } from "@/lib/authGuards";

// Receives the two message shapes the endpoint agent emits: heartbeats
// and dlp_event reports. Persisted to SQLite via Prisma (see
// src/lib/telemetryIngest.ts, shared with the WebSocket agent-message
// handler in server.ts). Kept as a REST fallback/testing path now that
// the real-time WebSocket transport (server.ts) exists.
//
// POST is agent traffic (ORG_ACCESS_KEY). GET returns recent
// alerts/heartbeats for dashboard debugging, not agent traffic — gated
// by the dashboard session instead. src/proxy.ts explicitly excludes
// this route's path from its blanket dashboard-session gate so
// legitimate agent POSTs aren't rejected before reaching this check.

export async function POST(request: Request) {
  const authError = requireOrgAccessKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const ipAddress = getClientIp(request);

  if (isValidDlpEvent(body)) {
    const alert = await ingestDlpEvent(body, { ipAddress });
    return NextResponse.json({ status: "recorded", id: alert.id }, { status: 201 });
  }

  if (isValidHeartbeat(body)) {
    await ingestHeartbeat(body, { ipAddress });
    return NextResponse.json({ status: "recorded" }, { status: 201 });
  }

  return NextResponse.json({ error: "unrecognized telemetry payload shape" }, { status: 422 });
}

export async function GET(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  const [recentAlerts, recentHeartbeats] = await Promise.all([
    prisma.dlpAlert.findMany({ orderBy: { timestamp: "desc" }, take: 50 }),
    prisma.heartbeat.findMany({ orderBy: { timestamp: "desc" }, take: 50 }),
  ]);
  return NextResponse.json({ recentAlerts, recentHeartbeats });
}
