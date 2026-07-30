// Insider-Shield — background service worker (Phase 2)
//
// Responsibilities: resolve effective policy (managed policy with local
// dev fallback), maintain a best-effort WebSocket link to the ingestion
// backend, send heartbeats, receive OTA policy updates, and relay DLP
// events from the content script — all gated behind an explicit
// "transmitEvents" kill switch that defaults to OFF. Nothing leaves the
// device until a managed or local policy explicitly turns it on.

const DEFAULT_POLICY = {
  dlpEnabled: false,
  transmitEvents: false,
  sensitivePatterns: [],
  heartbeatIntervalMs: 30000,
  wsEndpoint: "ws://localhost:3000/api/ws",
};

const POLICY_KEYS = ["dlpEnabled", "transmitEvents", "sensitivePatterns", "heartbeatIntervalMs", "wsEndpoint"];

function readManagedStorage() {
  return new Promise((resolve) => {
    chrome.storage.managed.get(null, (data) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }
      resolve(data || {});
    });
  });
}

function readLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => resolve(data || {}));
  });
}

// Only known, allow-listed keys are ever merged into the effective
// policy — an unexpected/malformed managed or local value can never
// silently flip the kill switch on.
function sanitizePolicy(raw) {
  const clean = {};
  for (const key of POLICY_KEYS) {
    if (raw && Object.prototype.hasOwnProperty.call(raw, key)) {
      clean[key] = raw[key];
    }
  }
  if (typeof clean.transmitEvents !== "boolean") delete clean.transmitEvents;
  if (typeof clean.dlpEnabled !== "boolean") delete clean.dlpEnabled;
  if (!Array.isArray(clean.sensitivePatterns)) delete clean.sensitivePatterns;
  if (typeof clean.heartbeatIntervalMs !== "number") delete clean.heartbeatIntervalMs;
  if (typeof clean.wsEndpoint !== "string") delete clean.wsEndpoint;
  return clean;
}

async function getEffectivePolicy() {
  const managed = await readManagedStorage();
  if (Object.keys(managed).length > 0) {
    return { ...DEFAULT_POLICY, ...sanitizePolicy(managed) };
  }
  const local = await readLocalStorage(["policy"]);
  return { ...DEFAULT_POLICY, ...sanitizePolicy(local.policy) };
}

async function getOrgKey() {
  const managed = await readManagedStorage();
  if (managed.orgKey) return managed.orgKey;

  const local = await readLocalStorage(["orgKey", "devOrgKey"]);
  if (local.orgKey) return local.orgKey;
  if (local.devOrgKey) return local.devOrgKey;

  // Local-dev-only fallback identifier — never to be confused with a
  // real enterprise-issued orgKey delivered via managed policy.
  const devOrgKey = `dev-${crypto.randomUUID()}`;
  await new Promise((resolve) => chrome.storage.local.set({ devOrgKey }, resolve));
  return devOrgKey;
}

// Unlike getOrgKey(), there is NO anonymous fallback here — a fake
// identity would defeat the point of per-employee session targeting.
// Managed policy (enterprise deployment) wins; the options page's local
// storage field (see extension/options/options.js) is the local-dev
// fallback, matching the orgKey precedent. Returns undefined if unset,
// in which case this connection is simply not employee-attributed.
async function getEmployeeEmail() {
  const managed = await readManagedStorage();
  if (managed.employeeEmail) return managed.employeeEmail;

  const local = await readLocalStorage(["employeeEmail"]);
  return local.employeeEmail || undefined;
}

// --- WebSocket client -------------------------------------------------
// Connects to the real-time transport server (server.ts) at wsEndpoint,
// identifying itself as an agent-role connection via ?role=agent so the
// server can route it separately from dashboard-role connections.

const wsClient = {
  socket: null,
  state: "idle", // idle | connecting | open | closed
  reconnectAttempts: 0,
  heartbeatTimer: null,
  eventBuffer: [], // bounded ring buffer, drained on send, cleared on reconnect
  employeeEmail: undefined, // set from getEmployeeEmail() at each connect attempt
};

const MAX_BUFFERED_EVENTS = 50;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

function scheduleReconnect(policy) {
  wsClient.state = "closed";
  wsClient.reconnectAttempts += 1;
  const backoff = Math.min(BASE_BACKOFF_MS * 2 ** wsClient.reconnectAttempts, MAX_BACKOFF_MS);
  const jitter = Math.random() * 0.3 * backoff;
  setTimeout(() => connectWebSocket(policy), backoff + jitter);
}

async function connectWebSocket(policy) {
  const effectivePolicy = policy || (await getEffectivePolicy());
  if (!effectivePolicy.transmitEvents) {
    wsClient.state = "idle";
    return;
  }
  if (wsClient.state === "connecting" || wsClient.state === "open") return;

  wsClient.state = "connecting";
  try {
    wsClient.employeeEmail = await getEmployeeEmail();
    const url = new URL(effectivePolicy.wsEndpoint);
    url.searchParams.set("role", "agent");
    if (wsClient.employeeEmail) url.searchParams.set("employeeEmail", wsClient.employeeEmail);
    wsClient.socket = new WebSocket(url.toString());
  } catch (err) {
    console.warn("[Insider-Shield] failed to construct WebSocket:", err);
    scheduleReconnect(effectivePolicy);
    return;
  }

  wsClient.socket.addEventListener("open", () => {
    console.log("[Insider-Shield] WebSocket connected.");
    wsClient.state = "open";
    wsClient.reconnectAttempts = 0;
    flushEventBuffer();
    startHeartbeat(effectivePolicy);
  });

  wsClient.socket.addEventListener("close", () => {
    console.log("[Insider-Shield] WebSocket closed; will retry.");
    stopHeartbeat();
    wsClient.eventBuffer = [];
    scheduleReconnect(effectivePolicy);
  });

  wsClient.socket.addEventListener("error", (err) => {
    console.warn("[Insider-Shield] WebSocket error:", err);
  });

  wsClient.socket.addEventListener("message", (event) => handleRemoteMessage(event));
}

function startHeartbeat(policy) {
  stopHeartbeat();
  wsClient.heartbeatTimer = setInterval(async () => {
    if (wsClient.state !== "open") return;
    const platform = await chrome.runtime.getPlatformInfo();
    sendOverSocket({
      type: "heartbeat",
      ts: Date.now(),
      platform,
      status: wsClient.state,
      employeeEmail: wsClient.employeeEmail,
    });
  }, policy.heartbeatIntervalMs);
}

function stopHeartbeat() {
  if (wsClient.heartbeatTimer) {
    clearInterval(wsClient.heartbeatTimer);
    wsClient.heartbeatTimer = null;
  }
}

function sendOverSocket(payload) {
  if (wsClient.state !== "open" || !wsClient.socket) return false;
  wsClient.socket.send(JSON.stringify(payload));
  return true;
}

function bufferEvent(payload) {
  wsClient.eventBuffer.push(payload);
  if (wsClient.eventBuffer.length > MAX_BUFFERED_EVENTS) {
    wsClient.eventBuffer.shift();
  }
}

function flushEventBuffer() {
  while (wsClient.eventBuffer.length > 0 && wsClient.state === "open") {
    sendOverSocket(wsClient.eventBuffer.shift());
  }
}

// Allow-listed remote OTA policy shape only. This channel never executes
// code received from the server — it only ever writes plain config
// values to local storage. A channel that let a remote server run
// arbitrary code in every open tab would be a serious backdoor
// regardless of intent, so that path is deliberately not implemented.
function handleRemoteMessage(event) {
  let parsed;
  try {
    parsed = JSON.parse(event.data);
  } catch {
    console.warn("[Insider-Shield] ignored non-JSON remote message.");
    return;
  }

  if (parsed.type === "terminate_session") {
    // Deliberately minimal: log and close. The durable block is the
    // server's WS-upgrade-time status gate (server.ts) — a revoked
    // employee's reconnect attempts get rejected there, not here. No
    // local "stop retrying" flag is set, so scheduleReconnect() will
    // keep retrying on its normal backoff (same as against any other
    // sustained rejection) — a known, accepted limitation for now.
    console.log("[Insider-Shield] session terminated by server:", parsed.reason || "(no reason given)");
    if (wsClient.socket) wsClient.socket.close(4001, "server_terminated");
    return;
  }

  if (parsed.type !== "policy_update" || typeof parsed.policy !== "object" || parsed.policy === null) {
    return;
  }
  const nextPolicy = sanitizePolicy(parsed.policy);
  chrome.storage.local.set({ policy: nextPolicy }, () => {
    console.log("[Insider-Shield] applied OTA policy update:", nextPolicy);
  });
}

// --- DLP event ingestion from content scripts -------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "dlp_event") {
    handleDlpEvent(message);
    sendResponse({ status: "ack" });
    return true;
  }
  sendResponse({ status: "ignored" });
  return true;
});

async function handleDlpEvent(message) {
  const policy = await getEffectivePolicy();
  const payload = {
    type: "dlp_event",
    hostname: message.hostname,
    ts: message.ts,
    ruleName: message.ruleName,
    excerptRedacted: message.excerptRedacted,
    employeeEmail: wsClient.employeeEmail,
  };

  if (!policy.dlpEnabled) {
    console.log("[Insider-Shield] DLP disabled by policy; event dropped:", payload);
    return;
  }

  if (!policy.transmitEvents || wsClient.state !== "open") {
    console.log("[Insider-Shield] not transmitting (kill switch off or offline); buffering locally:", payload);
    bufferEvent(payload);
    return;
  }

  sendOverSocket(payload);
}

// --- Lifecycle ----------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Insider-Shield] installed:", details.reason);
  await getOrgKey();
  const policy = await getEffectivePolicy();
  console.log("[Insider-Shield] effective policy at install:", policy);
  connectWebSocket(policy);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "managed" || (areaName === "local" && (changes.policy || changes.employeeEmail))) {
    // An employeeEmail change (e.g. saved via the options page) means
    // the current connection, if any, is under the wrong identity —
    // drop it so connectWebSocket() re-establishes with the new one.
    if (changes.employeeEmail && wsClient.socket) {
      wsClient.socket.close(4000, "identity_changed");
    }
    getEffectivePolicy().then((policy) => {
      console.log("[Insider-Shield] policy changed; re-evaluating connection:", policy);
      if (policy.transmitEvents && wsClient.state !== "open" && wsClient.state !== "connecting") {
        connectWebSocket(policy);
      }
    });
  }
});
