// Client-safe: no server imports (unlike src/lib/agents.ts, which pulls
// in @/lib/prisma and cannot be imported from "use client" code).

export type AgentStatus = "online" | "stale" | "offline";

// One connected (or previously connected) endpoint agent, assembled
// from Heartbeat rows joined to the ProvisioningToken it authenticated
// with. Deliberately NOT keyed off the Employee table — an agent whose
// employeeEmail doesn't match a known employee still needs to be
// visible, which was the whole reason this view exists.
export interface ConnectedAgent {
  // ProvisioningToken.id when the agent used a per-device token,
  // otherwise a synthetic key derived from its employeeEmail. Stable
  // enough to use as a React key and to group heartbeats by.
  key: string;
  deviceName: string | null;
  tokenId: string | null;
  tokenPrefix: string | null;
  employeeEmail: string | null;
  // Set only when employeeEmail matches a real Employee row — the
  // whole point being that an agent is listed either way.
  employeeName: string | null;
  platform: { os: string; arch: string } | null;
  ipAddress: string | null;
  lastSeenAt: string; // ISO
  status: AgentStatus;
  heartbeatCount: number;
}
