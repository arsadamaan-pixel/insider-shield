import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { ingestDlpEvent, ingestHeartbeat, isValidDlpEvent, isValidHeartbeat } from "@/lib/telemetryIngest";
import { sanitizePolicyUpdate, setPolicy } from "@/lib/policyStore";
import type { ServerToAgentMessage, ServerToDashboardMessage, WsRole } from "@/types";

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

const app = next({ dev });
const handle = app.getRequestHandler();

const agentSockets = new Set<WebSocket>();
const dashboardSockets = new Set<WebSocket>();

function broadcast(sockets: Set<WebSocket>, message: ServerToDashboardMessage | ServerToAgentMessage) {
  const json = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(json);
    }
  }
}

async function handleAgentMessage(raw: WebSocket.RawData) {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (isValidDlpEvent(payload)) {
    const alert = await ingestDlpEvent(payload);
    broadcast(dashboardSockets, { type: "dlp_alert", alert });
    return;
  }

  if (isValidHeartbeat(payload)) {
    await ingestHeartbeat(payload);
  }
}

async function handleDashboardMessage(raw: WebSocket.RawData) {
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
}

const wss = new WebSocketServer({ noServer: true });

function registerConnection(ws: WebSocket, role: WsRole) {
  const sockets = role === "agent" ? agentSockets : dashboardSockets;
  sockets.add(ws);

  ws.on("message", (raw) => {
    const handler = role === "agent" ? handleAgentMessage(raw) : handleDashboardMessage(raw);
    handler.catch((err) => console.error(`[ws] error handling ${role} message:`, err));
  });

  ws.on("close", () => {
    agentSockets.delete(ws);
    dashboardSockets.delete(ws);
  });

  ws.on("error", (err) => console.warn(`[ws] ${role} socket error:`, err));
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (pathname !== "/api/ws") {
      // Not ours — leave it alone so Next's own self-attached upgrade
      // listener (dev-mode HMR) can handle it.
      return;
    }

    const role = searchParams.get("role");
    if (role !== "agent" && role !== "dashboard") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerConnection(ws, role);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (WS at /api/ws, roles: agent, dashboard)`);
  });
});
