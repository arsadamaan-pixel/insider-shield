import { prisma } from "@/lib/prisma";
import { getLiveAgentSnapshot } from "@/lib/wsRegistry";
import type { AgentStatus, ConnectedAgent } from "@/types";

// Builds the Endpoints view's agent list from Heartbeat rows, joined to
// the ProvisioningToken each agent authenticated with (for the
// admin-assigned device name) and to Employee (for a display name, when
// the agent's email happens to match a real employee).
//
// Every other dashboard view starts from the Employee table, which
// meant a connected agent whose employeeEmail didn't match a known
// employee was completely invisible — heartbeats were being stored and
// nothing surfaced them. This module deliberately starts from the
// heartbeat side instead, so an unrecognized-but-authenticated agent
// still shows up (with a clearly empty employee column) rather than
// silently vanishing.

// A heartbeat is expected every policy.heartbeatIntervalMs (default
// 20s). "stale" is the window where an agent has stopped reporting but
// may just be mid-reconnect after an MV3 service-worker restart, which
// can take up to ~1 minute (see extension/background/background.js's
// keep-alive alarm) — calling that "offline" immediately would be a
// false alarm on every worker recycle.
const STALE_AFTER_MS = 90 * 1000;
const OFFLINE_AFTER_MS = 10 * 60 * 1000;

// Only aggregate recent heartbeats — the table grows by one row per
// agent every 20s, so an unbounded scan would degrade as it fills.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function parsePlatform(raw: string): { os: string; arch: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.os === "string" && typeof parsed.arch === "string") {
      return { os: parsed.os, arch: parsed.arch };
    }
  } catch {
    // fall through — a malformed platform blob shouldn't hide the agent
  }
  return null;
}

function deriveStatus(lastSeen: Date, isLive: boolean, now: number): AgentStatus {
  // An open socket is authoritative: the agent is connected right now
  // regardless of when its last heartbeat happened to land.
  if (isLive) return "online";
  const age = now - lastSeen.getTime();
  if (age <= STALE_AFTER_MS) return "online";
  if (age <= OFFLINE_AFTER_MS) return "stale";
  return "offline";
}

export async function listConnectedAgents(): Promise<ConnectedAgent[]> {
  const since = new Date(Date.now() - LOOKBACK_MS);

  const [heartbeats, tokens, employees] = await Promise.all([
    prisma.heartbeat.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
    }),
    prisma.provisioningToken.findMany(),
    prisma.employee.findMany({ select: { email: true, name: true } }),
  ]);

  const tokenById = new Map(tokens.map((t) => [t.id, t]));
  const nameByEmail = new Map(employees.map((e) => [e.email, e.name]));
  const live = getLiveAgentSnapshot();
  const now = Date.now();

  // Heartbeats arrive newest-first, so the first row seen for a key is
  // that agent's most recent — later rows only bump the count.
  const agents = new Map<string, ConnectedAgent>();

  for (const hb of heartbeats) {
    const key = hb.tokenId ?? (hb.employeeEmail ? `email:${hb.employeeEmail}` : "unattributed");

    const existing = agents.get(key);
    if (existing) {
      existing.heartbeatCount += 1;
      continue;
    }

    const token = hb.tokenId ? tokenById.get(hb.tokenId) : undefined;
    const isLive =
      (hb.tokenId ? live.tokenIds.has(hb.tokenId) : false) ||
      (hb.employeeEmail ? live.employeeEmails.has(hb.employeeEmail) : false);

    agents.set(key, {
      key,
      deviceName: token?.deviceName ?? null,
      tokenId: hb.tokenId,
      tokenPrefix: token?.tokenPrefix ?? null,
      employeeEmail: hb.employeeEmail,
      employeeName: hb.employeeEmail ? (nameByEmail.get(hb.employeeEmail) ?? null) : null,
      platform: parsePlatform(hb.platform),
      ipAddress: hb.ipAddress,
      lastSeenAt: hb.timestamp.toISOString(),
      status: deriveStatus(hb.timestamp, isLive, now),
      heartbeatCount: 1,
    });
  }

  const statusRank: Record<AgentStatus, number> = { online: 0, stale: 1, offline: 2 };
  return Array.from(agents.values()).sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
}
