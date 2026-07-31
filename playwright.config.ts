import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV } from "./tests/env";

// Phase 6: E2E suite drives the *real* custom server (server.ts), not
// `next build && next start` — server.ts is what attaches the `ws`
// WebSocket server at /api/ws (see PLAN.md/WORKLOG.md's Phase 3 notes:
// stock `next start` has no WS transport at all). Run in Next dev mode
// (no prior `next build` step needed) against a dedicated test DB/port/
// secrets (tests/env.ts) so this never touches the developer's real
// dev.db, .env secrets, or a dev server already running on port 3000.
export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: require.resolve("./tests/global-setup.ts"),
  globalTeardown: require.resolve("./tests/global-teardown.ts"),

  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },

  webServer: {
    command: "npx tsx server.ts",
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: E2E_ENV,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
