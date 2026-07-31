import { test, expect } from "@playwright/test";
import { WebSocket } from "ws";
import { E2E_BASE_URL, E2E_BEARER_TOKEN, E2E_OPERATOR_EMAIL } from "./env";

// The Endpoints view exists because every other dashboard page starts
// from the Employee table, so an authenticated agent whose
// employeeEmail didn't match a known employee was invisible even though
// its heartbeats were being stored. These tests pin exactly that: an
// agent with a deliberately unknown email must still be listed.

const WS_BASE_URL = E2E_BASE_URL.replace(/^http/, "ws");
const UNKNOWN_EMAIL = "not-a-real-employee@example.com";

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

test.describe("Endpoints view", () => {
  test("lists a connected agent, including one whose email is not a known employee", async ({ page }) => {
    // page.request (not the standalone `request` fixture) so the
    // session cookie lands in the same context page.goto() uses.
    const loginRes = await page.request.post(`${E2E_BASE_URL}/api/auth/login`, {
      data: { token: E2E_BEARER_TOKEN, operator: E2E_OPERATOR_EMAIL },
    });
    expect(loginRes.ok()).toBe(true);

    const deviceName = `Endpoint Test Device ${Date.now()}`;
    const createRes = await page.request.post(`${E2E_BASE_URL}/api/admin/provision-token`, {
      data: { deviceName },
    });
    expect(createRes.status()).toBe(201);
    const { token } = await createRes.json();

    const url = new URL(`${WS_BASE_URL}/api/ws`);
    url.searchParams.set("role", "agent");
    url.searchParams.set("orgAccessKey", token);
    url.searchParams.set("employeeEmail", UNKNOWN_EMAIL);

    const agent = createSocket(url.toString());
    await waitForOpen(agent);

    // Send a heartbeat explicitly rather than waiting for the agent's
    // own interval — this is the server-side ingest path under test,
    // not the extension's timer.
    agent.send(
      JSON.stringify({
        type: "heartbeat",
        ts: Date.now(),
        platform: { os: "linux", arch: "x86-64" },
        status: "open",
        employeeEmail: UNKNOWN_EMAIL,
      })
    );

    try {
      await page.goto(`${E2E_BASE_URL}/endpoints`);

      // The device name comes from the provisioning token, proving the
      // tokenId → device identity link survives the heartbeat ingest.
      const row = page.locator("tr", { hasText: deviceName });
      await expect(row).toBeVisible({ timeout: 10_000 });

      // Listed despite not matching any Employee row — the entire point.
      await expect(row).toContainText(UNKNOWN_EMAIL);
      await expect(row).toContainText(/not a known employee/i);

      // An open socket must read as online.
      await expect(row.getByText("online", { exact: true })).toBeVisible();
      await expect(row).toContainText("linux");
    } finally {
      agent.close();
    }
  });

  test("shows an empty state rather than erroring when nothing has reported", async ({ page }) => {
    const loginRes = await page.request.post(`${E2E_BASE_URL}/api/auth/login`, {
      data: { token: E2E_BEARER_TOKEN, operator: E2E_OPERATOR_EMAIL },
    });
    expect(loginRes.ok()).toBe(true);

    await page.goto(`${E2E_BASE_URL}/endpoints`);
    await expect(page.getByText("Endpoint Agents").first()).toBeVisible();
  });
});
