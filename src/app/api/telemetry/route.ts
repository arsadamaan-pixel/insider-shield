import { NextResponse } from "next/server";
import type { DlpSeverity } from "@/types";
import { prisma } from "@/lib/prisma";

// Receives the two message shapes the endpoint agent emits over its
// WebSocket link (extension/background/background.js): heartbeats and
// dlp_event reports. Persisted to SQLite via Prisma — see PLAN.md
// "SQLite Data Persistence" for context on the earlier in-memory version
// this replaces. A real WebSocket transport (vs. this plain HTTP POST)
// is still pending, noted since Phase 3.

const RULE_SEVERITY: Record<string, DlpSeverity> = {
  credit_card_like: "high",
  ssn_like: "critical",
  api_key_like: "high",
  large_paste: "medium",
  large_copy_selection: "low",
  large_cut_selection: "low",
};

interface IncomingDlpEvent {
  type: "dlp_event";
  hostname: string;
  ts: number;
  ruleName: string;
  excerptRedacted: string;
  orgKey?: string;
  employeeEmail?: string;
}

interface IncomingHeartbeat {
  type: "heartbeat";
  ts: number;
  platform: { os: string; arch: string };
  status: string;
  orgKey?: string;
}

type IncomingPayload = IncomingDlpEvent | IncomingHeartbeat;

function isValidDlpEvent(body: unknown): body is IncomingDlpEvent {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.type === "dlp_event" &&
    typeof b.hostname === "string" &&
    typeof b.ts === "number" &&
    typeof b.ruleName === "string" &&
    typeof b.excerptRedacted === "string"
  );
}

function isValidHeartbeat(body: unknown): body is IncomingHeartbeat {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    b.type === "heartbeat" &&
    typeof b.ts === "number" &&
    typeof b.status === "string" &&
    typeof b.platform === "object" &&
    b.platform !== null
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const payload = body as IncomingPayload;

  if (isValidDlpEvent(payload)) {
    const employeeEmail = payload.employeeEmail ?? "unknown@insider-shield.dev";
    const alert = await prisma.dlpAlert.create({
      data: {
        timestamp: new Date(payload.ts),
        severity: RULE_SEVERITY[payload.ruleName] ?? "low",
        employeeEmail,
        ruleTriggered: payload.ruleName,
        // Metadata-only description — never the raw matched text.
        snippet: `DLP rule "${payload.ruleName}" triggered on ${payload.hostname}`,
        redactedContent: payload.excerptRedacted,
        sourceUrl: payload.hostname,
      },
    });
    return NextResponse.json({ status: "recorded", id: alert.id }, { status: 201 });
  }

  if (isValidHeartbeat(payload)) {
    await prisma.heartbeat.create({
      data: {
        orgKey: payload.orgKey ?? "unknown",
        platform: JSON.stringify(payload.platform),
        timestamp: new Date(payload.ts),
        status: payload.status,
      },
    });
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
