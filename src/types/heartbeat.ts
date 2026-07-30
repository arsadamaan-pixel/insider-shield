// Matches the payload shape sent by extension/background/background.js's
// startHeartbeat() over the WebSocket link.
export interface HeartbeatPayload {
  type: "heartbeat";
  ts: number; // epoch millis, as sent by chrome.runtime — not ISO
  platform: {
    os: string;
    arch: string;
  };
  status: "open" | "connecting" | "closed" | "idle";
  orgKey?: string;
  employeeId?: string;
}
