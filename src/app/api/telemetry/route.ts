import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestDlpEvent, ingestHeartbeat, isValidDlpEvent, isValidHeartbeat } from "@/lib/telemetryIngest";

// Receives the two message shapes the endpoint agent emits: heartbeats
// and dlp_event reports. Persisted to SQLite via Prisma (see
// src/lib/telemetryIngest.ts, shared with the WebSocket agent-message
// handler in server.ts). Kept as a REST fallback/testing path now that
// the real-time WebSocket transport (server.ts) exists.

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (isValidDlpEvent(body)) {
    const alert = await ingestDlpEvent(body);
    return NextResponse.json({ status: "recorded", id: alert.id }, { status: 201 });
  }

  if (isValidHeartbeat(body)) {
    await ingestHeartbeat(body);
    return NextResponse.json({ status: "recorded" }, { status: 201 });
  }

  return NextResponse.json({ error: "unrecognized telemetry payload shape" }, { status: 422 });
}

export async function GET() {
  const [recentAlerts, recentHeartbeats] = await Promise.all([
    prisma.dlpAlert.findMany({ orderBy: { timestamp: "desc" }, take: 50 }),
    prisma.heartbeat.findMany({ orderBy: { timestamp: "desc" }, take: 50 }),
  ]);
  return NextResponse.json({ recentAlerts, recentHeartbeats });
}
