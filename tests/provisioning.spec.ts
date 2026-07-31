import { test, expect } from "@playwright/test";
import { WebSocket } from "ws";
import { E2E_BASE_URL, E2E_BEARER_TOKEN, E2E_OPERATOR_EMAIL } from "./env";

// Phase 8 — Enterprise Provisioning & One-Click Agent Token Generation.
//
// Deliberately self-contained and order-independent from
// tests/e2e.spec.ts: that suite's last scenario offboards its one
// seeded employee, which would remove it from the (status: "active")
// employee picker on /provisioning — so these tests never assume any
// particular employee exists/is active, only exercising the
// "unassigned device" path plus direct API/WS calls, which work
// regardless of which spec file Playwright runs first.

const WS_BASE_URL = E2E_BASE_URL.replace(/^http/, "ws");

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

function waitForMessage(ws: WebSocket, predicate: (msg: Record<string, unknown>) => boolean, timeoutMs = 10_000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`timed out after ${timeoutMs}ms waiting for a matching WS message`));
    }, timeoutMs);

    function onMessage(raw: Buffer) {
      let parsed: Record<string, unknown>;
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

test.describe("Phase 8: Enterprise Provisioning", () => {
  test("GET /api/admin/provision-token requires a dashboard session", async ({ request }) => {
    const res = await request.get(`${E2E_BASE_URL}/api/admin/provision-token`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/provision-token requires a dashboard session", async ({ request }) => {
    const res = await request.post(`${E2E_BASE_URL}/api/admin/provision-token`, { data: { deviceName: "x" } });
    expect(res.status()).toBe(401);
  });

  test("UI: generate an agent token, see it in the table, then revoke it", async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login`);
    await page.getByLabel("Access token").fill(E2E_BEARER_TOKEN);
    await page.getByLabel(/name or email/i).fill(E2E_OPERATOR_EMAIL);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);

    await page.goto(`${E2E_BASE_URL}/provisioning`);
    await expect(page.getByText("One-Click Token Generator")).toBeVisible();
    await expect(page.getByText("Active Provisioning Keys")).toBeVisible();

    const deviceName = `Playwright Device ${Date.now()}`;
    await page.getByPlaceholder("e.g. Amara's MacBook").fill(deviceName);
    await page.getByRole("button", { name: /generate agent token/i }).click();

    // The raw token is shown once, masked by default.
    const revealLink = page.getByRole("button", { name: /^reveal$/i });
    await expect(revealLink).toBeVisible();
    await revealLink.click();
    const tokenCode = page.locator("code").first();
    await expect(tokenCode).toHaveText(/^ist_/);

    // Copy button doesn't throw / is present and clickable.
    await page.getByRole("button", { name: /copy/i }).click();
    await expect(page.getByText(/^copied$/i)).toBeVisible();

    // New row appears in the table without a reload.
    const row = page.locator("tr", { hasText: deviceName });
    await expect(row).toBeVisible();
    await expect(row.getByText("active", { exact: true })).toBeVisible();

    // Revoke it.
    await row.getByRole("button", { name: /revoke token/i }).click();
    await expect(row.getByText("revoked", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: /revoke token/i })).toBeDisabled();
  });

  test("integration: a provisioned token authenticates an agent WS connection, and revoking it force-closes the session and blocks reconnects", async ({
    request,
  }) => {
    // Log in via the API directly (faster/more reliable for a
    // non-UI-focused integration check) to get a session cookie for
    // subsequent admin calls.
    const loginRes = await request.post(`${E2E_BASE_URL}/api/auth/login`, {
      data: { token: E2E_BEARER_TOKEN, operator: E2E_OPERATOR_EMAIL },
    });
    expect(loginRes.ok()).toBe(true);

    const createRes = await request.post(`${E2E_BASE_URL}/api/admin/provision-token`, {
      data: { deviceName: "Integration Test Device" },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.token).toMatch(/^ist_/);

    // The provisioned token authenticates a real agent WS connection —
    // same query param the extension already sends, no extension-side
    // change needed (see src/lib/agentTokens.ts's verifyAgentCredential).
    const agentSocket = createSocket(`${WS_BASE_URL}/api/ws?role=agent&orgAccessKey=${created.token}`);
    await waitForOpen(agentSocket);

    const terminateNotice = waitForMessage(agentSocket, (m) => m.type === "terminate_session");
    const socketClosed = new Promise<number>((resolve) => agentSocket.once("close", (code) => resolve(code)));

    const revokeRes = await request.post(`${E2E_BASE_URL}/api/admin/provision-token/revoke`, {
      data: { id: created.id },
    });
    expect(revokeRes.ok()).toBe(true);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.terminatedSessions).toBe(1);

    const notice = await terminateNotice;
    expect(notice.reason).toBe("token_revoked");
    const closeCode = await socketClosed;
    expect(closeCode).toBe(4001);

    // Reconnect attempts with the now-revoked token must be rejected
    // outright at the WS-upgrade level, not just delayed.
    const reconnect = createSocket(`${WS_BASE_URL}/api/ws?role=agent&orgAccessKey=${created.token}`);
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
    expect(rejectionStatus).toBe(401);
  });

  test("integration: revoking an already-revoked or unknown token id is handled cleanly", async ({ request }) => {
    const loginRes = await request.post(`${E2E_BASE_URL}/api/auth/login`, {
      data: { token: E2E_BEARER_TOKEN, operator: E2E_OPERATOR_EMAIL },
    });
    expect(loginRes.ok()).toBe(true);

    const missingRes = await request.post(`${E2E_BASE_URL}/api/admin/provision-token/revoke`, {
      data: { id: "does-not-exist" },
    });
    expect(missingRes.status()).toBe(404);

    const createRes = await request.post(`${E2E_BASE_URL}/api/admin/provision-token`, {
      data: { deviceName: "Double Revoke Device" },
    });
    const created = await createRes.json();

    const firstRevoke = await request.post(`${E2E_BASE_URL}/api/admin/provision-token/revoke`, {
      data: { id: created.id },
    });
    expect(firstRevoke.status()).toBe(200);

    // Revoking again should still succeed cleanly (idempotent-ish: the
    // token stays revoked, just reports 0 sessions terminated this time)
    // rather than erroring.
    const secondRevoke = await request.post(`${E2E_BASE_URL}/api/admin/provision-token/revoke`, {
      data: { id: created.id },
    });
    expect(secondRevoke.status()).toBe(200);
    const secondBody = await secondRevoke.json();
    expect(secondBody.terminatedSessions).toBe(0);
  });
});
