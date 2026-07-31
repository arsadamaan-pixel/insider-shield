// Insider-Shield — background service worker (Phase 2, revised Phase 8)
//
// Responsibilities: resolve effective policy (managed policy with local
// dev fallback), maintain a best-effort WebSocket link to the ingestion
// backend, send heartbeats, receive OTA policy updates, and relay DLP
// events from the content script.
//
// Two separate gates, deliberately NOT the same one:
//
//   1. Connecting at all — gated on having an orgAccessKey (a
//      credential an admin explicitly provisioned for this device).
//      A credentialed device connects and heartbeats regardless of the
//      DLP kill switch, so it shows up in the SOC dashboard and can
//      RECEIVE policy over the OTA channel.
//
//   2. Sending DLP event content — gated on `dlpEnabled` +
//      `transmitEvents`, both still defaulting to OFF. No clipboard/
//      paste content ever leaves the device until an admin turns those
//      on.
//
// These were previously the same gate (connectWebSocket() returned
// early when transmitEvents was false), which created a bootstrap
// deadlock: OTA policy updates only arrive over an open socket, so a
// device with the kill switch off could never be told to turn it on —
// every device needed manual, per-device configuration forever. Keeping
// the connection ungated (but the DLP payload gated) is what makes the
// dashboard's Policies page able to control real devices remotely.

const DEFAULT_POLICY = {
  dlpEnabled: false,
  transmitEvents: false,
  sensitivePatterns: [],
  // Deliberately under 30s: Chrome MV3 terminates an idle service
  // worker after ~30 seconds, and WebSocket activity is what resets
  // that idle timer. A 30000ms heartbeat sits exactly ON the timeout
  // boundary — a race the worker frequently loses. 20s keeps the
  // socket (and therefore the worker) reliably alive while connected.
  heartbeatIntervalMs: 20000,
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

// Unlike getOrgKey() (a per-install device ID, never validated by
// anything), this is the new shared-secret credential the server
// actually authenticates agent WebSocket connections with (Phase 5's
// ORG_ACCESS_KEY check in server.ts's WS upgrade handler). No anonymous
// fallback: an agent with no orgAccessKey configured simply cannot
// connect, by design.
async function getOrgAccessKey() {
  const managed = await readManagedStorage();
  if (managed.orgAccessKey) return managed.orgAccessKey;

  const local = await readLocalStorage(["orgAccessKey"]);
  return local.orgAccessKey || undefined;
}

// --- Toolbar status badge ---------------------------------------------
// A coloured dot on the extension icon so the connection state is
// visible at a glance without opening DevTools — green = live link to
// the SOC server, red = down/retrying, grey = no credential configured
// yet (which is a setup step, not a failure, so it deliberately reads
// differently from red). The tooltip carries the same information in
// words, since colour alone isn't accessible.

const BADGE_STATES = {
  connected: { color: "#10b981", title: "Insider-Shield — connected to SOC server" },
  disconnected: { color: "#ef4444", title: "Insider-Shield — disconnected, retrying…" },
  unconfigured: { color: "#64748b", title: "Insider-Shield — no access key set (open Options)" },
};

function setStatusBadge(state) {
  const badge = BADGE_STATES[state];
  if (!badge) return;
  // chrome.action calls reject while the worker is shutting down; a
  // cosmetic badge must never take the agent down with it.
  try {
    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: badge.color });
    chrome.action.setTitle({ title: badge.title });
  } catch (err) {
    console.warn("[Insider-Shield] could not update status badge:", err);
  }
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
  orgAccessKey: undefined, // set from getOrgAccessKey() at each connect attempt
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
  if (wsClient.state === "connecting" || wsClient.state === "open") return;

  wsClient.state = "connecting";
  try {
    wsClient.employeeEmail = await getEmployeeEmail();
    wsClient.orgAccessKey = await getOrgAccessKey();

    // The only gate on connecting. Without a credential the server
    // rejects the upgrade with a 401 anyway (see server.ts), so
    // attempting it would just spin a reconnect loop against a
    // guaranteed rejection — and log an agent_auth_failed audit entry
    // on every attempt.
    if (!wsClient.orgAccessKey) {
      console.log(
        "[Insider-Shield] no orgAccessKey configured — not connecting. Set one via the options page or an enterprise managed policy."
      );
      wsClient.state = "idle";
      setStatusBadge("unconfigured");
      return;
    }

    const url = new URL(effectivePolicy.wsEndpoint);
    url.searchParams.set("role", "agent");
    if (wsClient.orgAccessKey) url.searchParams.set("orgAccessKey", wsClient.orgAccessKey);
    if (wsClient.employeeEmail) url.searchParams.set("employeeEmail", wsClient.employeeEmail);
    wsClient.socket = new WebSocket(url.toString());
  } catch (err) {
    console.warn("[Insider-Shield] failed to construct WebSocket:", err);
    setStatusBadge("disconnected");
    scheduleReconnect(effectivePolicy);
    return;
  }

  wsClient.socket.addEventListener("open", () => {
    console.log("[Insider-Shield] WebSocket connected.");
    wsClient.state = "open";
    wsClient.reconnectAttempts = 0;
    setStatusBadge("connected");
    flushEventBuffer();
    startHeartbeat(effectivePolicy);
  });

  wsClient.socket.addEventListener("close", () => {
    console.log("[Insider-Shield] WebSocket closed; will retry.");
    stopHeartbeat();
    wsClient.eventBuffer = [];
    setStatusBadge("disconnected");
    scheduleReconnect(effectivePolicy);
  });

  wsClient.socket.addEventListener("error", (err) => {
    console.warn("[Insider-Shield] WebSocket error:", err);
    setStatusBadge("disconnected");
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

// --- MV3 service-worker revival ---------------------------------------
// Chrome MV3 terminates an idle service worker after ~30 seconds,
// taking any open WebSocket down with it. While a socket is connected
// its own traffic (the heartbeat above) keeps the worker alive — but
// once the worker IS killed, nothing in the extension itself is left
// running to notice or reconnect, so the agent silently stays offline
// until the browser restarts or the user touches the options page.
// That is exactly the "have to fix it by hand on every device" failure
// this is meant to avoid.
//
// chrome.alarms survives worker termination (the browser holds it, not
// the worker) and wakes the worker back up when it fires — the standard
// MV3 pattern for exactly this. On each wake, a fresh worker starts
// with wsClient.state back at "idle", so the check below correctly
// reconnects. 1 minute is the smallest period reliably supported
// across Chromium versions, so worst-case offline window after an
// unexpected termination is about a minute.

const RECONNECT_ALARM_NAME = "insider-shield-reconnect";

function ensureReconnectAlarm() {
  chrome.alarms.create(RECONNECT_ALARM_NAME, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RECONNECT_ALARM_NAME) return;
  if (wsClient.state === "open" || wsClient.state === "connecting") return;

  // The badge is stored by the browser, not by this worker, so it
  // survives worker termination — meaning it can still read green from
  // a connection that died with the previous worker. Reaching here
  // means the socket is definitively down, so correct it before
  // attempting to reconnect rather than leaving a stale "all good".
  setStatusBadge("disconnected");

  const policy = await getEffectivePolicy();
  console.log("[Insider-Shield] keep-alive alarm; socket not open, reconnecting.");
  connectWebSocket(policy);
});

// --- Lifecycle ----------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Insider-Shield] installed:", details.reason);
  ensureReconnectAlarm();
  await getOrgKey();
  const policy = await getEffectivePolicy();
  console.log("[Insider-Shield] effective policy at install:", policy);
  connectWebSocket(policy);
});

// onInstalled only fires on install/update — without this, a device
// that simply restarted its browser would sit disconnected until some
// unrelated storage change happened to trigger a reconnect, which
// defeats the point of not needing to touch the device.
chrome.runtime.onStartup.addListener(async () => {
  ensureReconnectAlarm();
  const policy = await getEffectivePolicy();
  console.log("[Insider-Shield] browser startup; connecting.");
  connectWebSocket(policy);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "managed" || (areaName === "local" && (changes.policy || changes.employeeEmail || changes.orgAccessKey))) {
    // An employeeEmail/orgAccessKey change (e.g. saved via the options
    // page) means the current connection, if any, is under the wrong
    // identity/credential — drop it so connectWebSocket() re-establishes
    // with the new one.
    if ((changes.employeeEmail || changes.orgAccessKey) && wsClient.socket) {
      wsClient.socket.close(4000, "identity_changed");
    }
    getEffectivePolicy().then((policy) => {
      console.log("[Insider-Shield] policy changed; re-evaluating connection:", policy);
      // No transmitEvents check here — see the header comment: a
      // credentialed device connects regardless, so that flipping the
      // kill switch ON from the dashboard can actually reach it.
      if (wsClient.state !== "open" && wsClient.state !== "connecting") {
        connectWebSocket(policy);
      }
    });
  }
});
