import type { DlpAlert } from "./dlpAlert";
import type { SystemPolicy } from "./systemPolicy";

export type WsRole = "agent" | "dashboard";

export interface DlpAlertMessage {
  type: "dlp_alert";
  alert: DlpAlert;
}

// Sent by the server, after a policy_update has been applied — always
// the full resulting policy (never a partial diff).
export interface PolicyUpdateMessage {
  type: "policy_update";
  policy: SystemPolicy;
}

// Sent by a dashboard client requesting a change — a partial update,
// allow-list-validated server-side via sanitizePolicyUpdate().
export interface PolicyUpdateRequestMessage {
  type: "policy_update";
  policy: Partial<SystemPolicy>;
  updatedBy?: string;
}

// Sent when an employee is offboarded/revoked — tells the agent to
// close its connection. The server also enforces this at the WS
// upgrade level (rejects reconnects for non-active employees), so this
// message is a courtesy notice, not the sole enforcement mechanism.
export interface TerminateSessionMessage {
  type: "terminate_session";
  reason?: string;
}

// Messages the server pushes to dashboard-role sockets.
export type ServerToDashboardMessage = DlpAlertMessage | PolicyUpdateMessage;

// Messages the server pushes to agent-role sockets.
export type ServerToAgentMessage = PolicyUpdateMessage | TerminateSessionMessage;

// Messages a dashboard-role socket sends to the server.
export type DashboardToServerMessage = PolicyUpdateRequestMessage;
