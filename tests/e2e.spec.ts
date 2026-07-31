import { test, expect, type Page } from "@playwright/test";
import { WebSocket, type RawData } from "ws";
import { randomUUID } from "node:crypto";
import { E2E_BASE_URL, E2E_BEARER_TOKEN, E2E_ORG_ACCESS_KEY, E2E_OPERATOR_EMAIL, E2E_TEST_EMPLOYEE } from "./env";

// Five scenarios, run in order against one shared authenticated page and
// one shared agent WebSocket — later scenarios genuinely depend on
// earlier ones (the offboarding test needs a still-open agent session
// from the telemetry test; the audit test needs the login/policy/revoke
// rows the earlier tests produced), so this is a deliberate serial flow
// rather than independent isolated tests.

const WS_BASE_URL = E2E_BASE_URL.replace(/^http/, "ws");

function agentSocketUrl(employeeEmail: string): string {
  const url = new URL(`${WS_BASE_URL}/api/ws`);
  url.searchParams.set("role", "agent");
  url.searchParams.set("orgAccessKey", E2E_ORG_ACCESS_KEY);
  url.searchParams.set("employeeEmail", employeeEmail);
  return url.toString();
}

// Every WebSocket instance gets a permanent no-op 'error' listener the
// moment it's constructed — `ws` sockets are EventEmitters, and an
// 'error' event with zero listeners throws and crashes the whole test
// process. Callers that care about a specific error still attach their
// own additional `.once("error", ...)` on top of this.
function createSocket(url: string): WebSocket {
  const ws = new WebSocket(url);
  ws.on("error", () => {});
  return ws;
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

type WsTestMessage = Record<string, unknown> & { type: string };

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: WsTestMessage) => boolean,
  timeoutMs = 10_000
): Promise<WsTestMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`timed out after ${timeoutMs}ms waiting for a matching WS message`));
    }, timeoutMs);

    function onMessage(raw: RawData) {
      let parsed: WsTestMessage;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(parsed);
      }
    }
    ws.on("message", onMessage);
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Insider-Shield Phase 6 E2E", () => {
  let sharedPage: Page;
  let agentSocket: WebSocket;
  const uniqueHostname = `e2e-${randomUUID()}.example.com`;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
  });

  test.afterAll(async () => {
    if (agentSocket && agentSocket.readyState === WebSocket.OPEN) agentSocket.close();
    await sharedPage.context().close();
  });

  test("Auth & Session Flow: valid Bearer token login issues a dashboard session cookie", async () => {
    await sharedPage.goto("/");
    // src/proxy.ts redirects unauthenticated requests to /login?next=<path>
    await expect(sharedPage).toHaveURL(/\/login\?next=%2F/);

    await sharedPage.getByLabel("Access token").fill(E2E_BEARER_TOKEN);
    await sharedPage.getByLabel(/name or email/i).fill(E2E_OPERATOR_EMAIL);
    await sharedPage.getByRole("button", { name: /sign in/i }).click();

    await expect(sharedPage).toHaveURL(`${E2E_BASE_URL}/`);
    // Proves the session actually authorized dashboard content, not just
    // that a redirect happened.
    await expect(sharedPage.getByText("SOC Dashboard Overview")).toBeVisible();

    const cookies = await sharedPage.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "is_session");
    expect(sessionCookie, "is_session cookie must be set after a valid login").toBeTruthy();
    expect(sessionCookie!.httpOnly).toBe(true);
  });

  test("Telemetry & WS Broadcast: an agent's high-severity DLP payload reaches the Live Incident Feed with no reload", async () => {
    // The dashboard-role socket (LiveIncidentFeed, mounted on "/" from
    // the previous step) must be open before we broadcast, or the
    // server-side broadcast() will simply miss it — it only fans out to
    // sockets already in dashboardSockets at send time.
    await expect(sharedPage.getByText("Live", { exact: true })).toBeVisible({ timeout: 10_000 });

    agentSocket = createSocket(agentSocketUrl(E2E_TEST_EMPLOYEE.email));
    await waitForOpen(agentSocket);

    agentSocket.send(
      JSON.stringify({
        type: "dlp_event",
        hostname: uniqueHostname,
        ts: Date.now(),
        ruleName: "credit_card_like", // maps to severity "high" — see src/lib/telemetryIngest.ts's RULE_SEVERITY
        excerptRedacted: "41**********11",
        employeeEmail: E2E_TEST_EMPLOYEE.email,
      })
    );

    // No page.goto()/reload() anywhere in this test — the row must
    // appear purely from the live WS push.
    const row = sharedPage.locator("tr", { hasText: uniqueHostname });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(E2E_TEST_EMPLOYEE.name);
    await expect(row.getByText("high", { exact: true })).toBeVisible();
  });

  test("Policy Push: a Policy Control Panel update is dispatched as policy_update to connected agents", async () => {
    const nextPolicyUpdate = waitForMessage(agentSocket, (m) => m.type === "policy_update");

    await sharedPage.goto("/policies");
    await expect(sharedPage.getByText("Live", { exact: true })).toBeVisible({ timeout: 10_000 });

    const dlpCheckbox = sharedPage.getByLabel("DLP Detection");
    const wasChecked = await dlpCheckbox.isChecked();
    if (wasChecked) await dlpCheckbox.uncheck();
    else await dlpCheckbox.check();

    await sharedPage.getByRole("button", { name: /push update/i }).click();
    await expect(sharedPage.getByText(/pushed via websocket/i)).toBeVisible();

    const message = await nextPolicyUpdate;
    const policy = message.policy as { dlpEnabled: boolean };
    expect(policy.dlpEnabled).toBe(!wasChecked);
  });

  test("IAM Offboarding & Revocation: offboarding force-terminates the live session and blocks reconnects with 403", async () => {
    const terminateNotice = waitForMessage(agentSocket, (m) => m.type === "terminate_session");
    const socketClosed = new Promise<number>((resolve) => agentSocket.once("close", (code) => resolve(code)));

    await sharedPage.goto("/users");
    const row = sharedPage.locator("tr", { hasText: E2E_TEST_EMPLOYEE.name });
    await row.getByRole("button", { name: /offboard.*revoke/i }).click();

    const dialog = sharedPage.getByRole("dialog");
    await dialog.getByRole("button", { name: /confirm revoke/i }).click();
    await expect(dialog.getByText(/1 active session terminated/i)).toBeVisible();

    await terminateNotice;
    const closeCode = await socketClosed;
    expect(closeCode).toBe(4001); // src/lib/wsRegistry.ts's terminateEmployeeSessions() close code

    // The durable enforcement: a brand-new connection attempt for the
    // now-offboarded employee must be rejected at the WS-upgrade level,
    // not merely delayed — server.ts checks employee.status there.
    const reconnect = createSocket(agentSocketUrl(E2E_TEST_EMPLOYEE.email));
    const rejectionStatus = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("reconnect attempt never resolved")), 10_000);
      reconnect.once("unexpected-response", (_req, res) => {
        clearTimeout(timer);
        resolve(res.statusCode ?? 0);
      });
      reconnect.once("open", () => {
        clearTimeout(timer);
        reject(new Error("reconnect should have been rejected, but the upgrade succeeded"));
      });
    });
    expect(rejectionStatus).toBe(403);
  });

  test("Audit Trail Verification: login, policy update, and revocation all appear with the correct actor and a timestamp", async () => {
    await sharedPage.goto("/audit");

    const loginRow = sharedPage.locator("tr", { hasText: "login_succeeded" }).first();
    await expect(loginRow).toBeVisible();
    await expect(loginRow).toContainText(E2E_OPERATOR_EMAIL);
    // Time column renders via toLocaleString({..., second: "2-digit"}) —
    // asserting a full hh:mm:ss pattern rather than Date.parse()ing a
    // locale-formatted string, which is inherently format-fragile.
    await expect(loginRow.locator("td").first()).toHaveText(/\d{1,2}:\d{2}:\d{2}/);

    const policyRow = sharedPage.locator("tr", { hasText: "policy_update" }).first();
    await expect(policyRow).toBeVisible();
    await expect(policyRow).toContainText(E2E_OPERATOR_EMAIL);
    await expect(policyRow.locator("td").first()).toHaveText(/\d{1,2}:\d{2}:\d{2}/);

    const revokeRow = sharedPage.locator("tr", { hasText: "employee_revoked" }).first();
    await expect(revokeRow).toBeVisible();
    await expect(revokeRow).toContainText(E2E_TEST_EMPLOYEE.email);
    await expect(revokeRow).toContainText(E2E_OPERATOR_EMAIL);
    await expect(revokeRow.locator("td").first()).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
  });
});
