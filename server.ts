import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { ingestDlpEvent, ingestHeartbeat, isValidDlpEvent, isValidHeartbeat } from "@/lib/telemetryIngest";
import { sanitizePolicyUpdate, setPolicy } from "@/lib/policyStore";
import { prisma } from "@/lib/prisma";
import { agentSockets, dashboardSockets, broadcast, registerConnection } from "@/lib/wsRegistry";
import { getSessionOperator, hasValidDashboardSession } from "@/lib/auth";
import { verifyAgentCredential } from "@/lib/agentTokens";
import { logAuditEvent } from "@/lib/auditLog";
import type { WsRole } from "@/types";

// Custom server wrapping the Next.js App Router so a long-lived `ws`
// WebSocket server can share the same port at /api/ws — standard Next.js
// API routes (and Vercel serverless functions) can't hold WebSocket
// upgrades open, which is why this exists (see PLAN.md Phase 3).
//
// Next.js self-attaches its own 'upgrade' listener (for dev-mode HMR) to
// this same http.Server the first time a request goes through
// `handle()` — see next/dist/server/next.js `setupWebSocketHandler`.
// That means we don't need to forward anything to Next ourselves: our
// own 'upgrade' listener below only needs to act on `/api/ws` and no-op
// for every other path, letting Next's listener (registered separately)
// handle HMR untouched.

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

interface AgentIdentity {
  employeeEmail?: string;
  ipAddress?: string;
}

async function handleAgentMessage(raw: WebSocket.RawData, identity: AgentIdentity) {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return;
  }

  // Connection-level identity (established at handshake) wins over
  // anything a payload itself claims — a message can't assert a
  // different identity mid-connection than what it authenticated with.
  if (isValidDlpEvent(payload)) {
    const alert = await ingestDlpEvent(
      { ...payload, employeeEmail: identity.employeeEmail ?? payload.employeeEmail },
      { ipAddress: identity.ipAddress }
    );
    broadcast(dashboardSockets, { type: "dlp_alert", alert });
    return;
  }

  if (isValidHeartbeat(payload)) {
    await ingestHeartbeat(
      { ...payload, employeeEmail: identity.employeeEmail ?? payload.employeeEmail },
      { ipAddress: identity.ipAddress }
    );
  }
}

interface DashboardContext {
  operator?: string;
  ipAddress?: string;
}

async function handleDashboardMessage(raw: WebSocket.RawData, context: DashboardContext) {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).type !== "policy_update") {
    return;
  }

  const update = sanitizePolicyUpdate((payload as Record<string, unknown>).policy);
  if (!update || Object.keys(update).length === 0) return;

  const updatedByRaw = (payload as Record<string, unknown>).updatedBy;
  const updatedBy = typeof updatedByRaw === "string" ? updatedByRaw : "dashboard-ws";

  const policy = await setPolicy(update, updatedBy);
  broadcast(agentSockets, { type: "policy_update", policy });
  broadcast(dashboardSockets, { type: "policy_update", policy });

  await logAuditEvent({
    actorEmail: context.operator ?? updatedBy,
    action: "policy_update",
    targetResource: "SystemPolicy",
    details: update,
    ipAddress: context.ipAddress,
  });
}

const wss = new WebSocketServer({ noServer: true });

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (pathname !== "/api/ws") {
      // Not ours — leave it alone so Next's own self-attached upgrade
      // listener (dev-mode HMR) can handle it.
      return;
    }

    const role = searchParams.get("role") as WsRole | null;
    if (role !== "agent" && role !== "dashboard") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const ipAddress = req.socket.remoteAddress ?? undefined;

    // Credential check first, before any employee-status lookup below —
    // an unauthenticated caller must get a uniform 401 with zero
    // information leakage, not a chance to probe whether a given
    // employeeEmail exists/is active.
    //
    // verifyAgentCredential() accepts either the static org-wide
    // ORG_ACCESS_KEY or a per-device ProvisioningToken (Phase 8) — same
    // "orgAccessKey" query param either way, no extension-side change
    // needed to support the new per-device tokens.
    let agentTokenId: string | undefined;
    if (role === "agent") {
      const credential = await verifyAgentCredential(searchParams.get("orgAccessKey"));
      if (!credential.valid) {
        void logAuditEvent({
          actorEmail: "unknown",
          action: "agent_auth_failed",
          targetResource: "/api/ws",
          details: { reason: "invalid_or_missing_orgAccessKey" },
          ipAddress,
        });
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      agentTokenId = credential.tokenId;
    } else {
      if (!hasValidDashboardSession(req.headers.cookie)) {
        void logAuditEvent({
          actorEmail: "unknown",
          action: "dashboard_auth_failed",
          targetResource: "/api/ws",
          details: { reason: "invalid_or_missing_session" },
          ipAddress,
        });
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    const employeeEmail = role === "agent" ? (searchParams.get("employeeEmail") ?? undefined) : undefined;
    const dashboardOperator = role === "dashboard" ? getSessionOperator(req.headers.cookie) : undefined;

    // Reject reconnects for an employee whose access has been revoked —
    // without this, terminateEmployeeSessions() only delays reconnection
    // by one backoff cycle instead of actually blocking it.
    if (employeeEmail) {
      const employee = await prisma.employee.findUnique({ where: { email: employeeEmail } });
      if (employee && employee.status !== "active") {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerConnection(ws, role, { employeeEmail, tokenId: agentTokenId, ipAddress });

      ws.on("message", (raw) => {
        const handler =
          role === "agent"
            ? handleAgentMessage(raw, { employeeEmail, ipAddress })
            : handleDashboardMessage(raw, { operator: dashboardOperator, ipAddress });
        handler.catch((err) => console.error(`[ws] error handling ${role} message:`, err));
      });

      ws.on("error", (err) => console.warn(`[ws] ${role} socket error:`, err));
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (WS at /api/ws, roles: agent, dashboard)`);
  });
});
