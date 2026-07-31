import { WebSocket } from "ws";
import type { ServerToAgentMessage, ServerToDashboardMessage, WsRole } from "@/types";

// Holds the live WebSocket connection registry. Extracted out of
// server.ts (rather than left inline there) so a plain Next.js Route
// Handler — e.g. the employee-revoke API route — can import
// terminateEmployeeSessions() directly, without importing from the
// process entrypoint. server.ts (the custom server) and every Next
// API route run in the same Node process, so this is genuinely shared
// state, not a cross-process concern.
//
// globalThis-cached (same pattern as src/lib/prisma.ts) as a guard
// against this module being instantiated twice by separate loaders
// (tsx for server.ts vs. Next's own dev-mode bundler for route
// handlers) — without it, terminateEmployeeSessions() could silently
// operate on an empty registry that never saw any real connections.
interface SocketIdentity {
  role: WsRole;
  employeeEmail?: string;
  // Set only when a per-device ProvisioningToken (Phase 8), not the
  // static ORG_ACCESS_KEY, authenticated this connection — see
  // src/lib/agentTokens.ts's verifyAgentCredential().
  tokenId?: string;
  ipAddress?: string;
}

interface WsRegistryGlobal {
  agentSockets: Set<WebSocket>;
  dashboardSockets: Set<WebSocket>;
  agentSocketsByEmail: Map<string, Set<WebSocket>>;
  agentSocketsByTokenId: Map<string, Set<WebSocket>>;
  socketIdentity: WeakMap<WebSocket, SocketIdentity>;
}

const g = globalThis as unknown as { __wsRegistry?: WsRegistryGlobal };
const registry: WsRegistryGlobal =
  g.__wsRegistry ??
  {
    agentSockets: new Set(),
    dashboardSockets: new Set(),
    agentSocketsByEmail: new Map(),
    agentSocketsByTokenId: new Map(),
    socketIdentity: new WeakMap(),
  };
g.__wsRegistry = registry;

export const agentSockets = registry.agentSockets;
export const dashboardSockets = registry.dashboardSockets;
export const agentSocketsByEmail = registry.agentSocketsByEmail;
export const agentSocketsByTokenId = registry.agentSocketsByTokenId;

export function registerConnection(
  ws: WebSocket,
  role: WsRole,
  identity?: { employeeEmail?: string; tokenId?: string; ipAddress?: string }
): void {
  const sockets = role === "agent" ? agentSockets : dashboardSockets;
  sockets.add(ws);
  registry.socketIdentity.set(ws, { role, ...identity });

  if (role === "agent" && identity?.employeeEmail) {
    const email = identity.employeeEmail;
    const set = agentSocketsByEmail.get(email) ?? new Set<WebSocket>();
    set.add(ws);
    agentSocketsByEmail.set(email, set);
  }

  if (role === "agent" && identity?.tokenId) {
    const tokenId = identity.tokenId;
    const set = agentSocketsByTokenId.get(tokenId) ?? new Set<WebSocket>();
    set.add(ws);
    agentSocketsByTokenId.set(tokenId, set);
  }

  ws.on("close", () => {
    agentSockets.delete(ws);
    dashboardSockets.delete(ws);
    const identity = registry.socketIdentity.get(ws);
    if (identity?.employeeEmail) {
      const set = agentSocketsByEmail.get(identity.employeeEmail);
      set?.delete(ws);
      if (set && set.size === 0) agentSocketsByEmail.delete(identity.employeeEmail);
    }
    if (identity?.tokenId) {
      const set = agentSocketsByTokenId.get(identity.tokenId);
      set?.delete(ws);
      if (set && set.size === 0) agentSocketsByTokenId.delete(identity.tokenId);
    }
    registry.socketIdentity.delete(ws);
  });
}

export function broadcast(sockets: Iterable<WebSocket>, message: ServerToDashboardMessage | ServerToAgentMessage): void {
  const json = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(json);
  }
}

// Sends a courtesy notice then force-closes every live socket for the
// given employee. Returns the number of sockets closed. The durable
// enforcement is the WS-upgrade-time status gate in server.ts (an
// offboarded employee can't reconnect) — this only handles the
// already-connected case.
export function terminateEmployeeSessions(email: string): number {
  return terminateSocketSet(agentSocketsByEmail.get(email), "offboarded");
}

// Same idea as terminateEmployeeSessions(), scoped to one provisioning
// token instead of one employee — used when an admin revokes a specific
// agent/device token (Phase 8). The durable enforcement is
// verifyAgentCredential() rejecting that token's hash on any future
// connection attempt; this only handles the already-connected case.
export function terminateTokenSessions(tokenId: string): number {
  return terminateSocketSet(agentSocketsByTokenId.get(tokenId), "token_revoked");
}

function terminateSocketSet(sockets: Set<WebSocket> | undefined, reason: string): number {
  if (!sockets || sockets.size === 0) return 0;

  let closed = 0;
  for (const ws of Array.from(sockets)) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "terminate_session", reason } satisfies ServerToAgentMessage));
      } catch {
        // best-effort — the close() below is what actually terminates it
      }
    }
    ws.close(4001, "session_revoked");
    closed += 1;
  }
  return closed;
}
