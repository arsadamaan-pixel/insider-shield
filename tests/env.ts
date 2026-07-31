import path from "node:path";

// Single source of truth for the E2E run's port/secrets/test-fixture
// identity, imported by playwright.config.ts, the global setup/teardown
// scripts, and the spec file itself. A dedicated port + SQLite file +
// secrets, distinct from the developer's normal `npm run dev` (port
// 3000, dev.db, real .env secrets) — so running this suite never
// touches real dev data or collides with a dev server already running.

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const E2E_DB_PATH = path.join(__dirname, "..", "prisma", "e2e-test.db");

export const E2E_ORG_ACCESS_KEY = "e2e-org-access-key";
export const E2E_BEARER_TOKEN = "e2e-bearer-token";
export const E2E_SESSION_SECRET = "e2e-session-secret-do-not-use-in-prod";

export const E2E_ENV: Record<string, string> = {
  DATABASE_URL: `file:${E2E_DB_PATH}`,
  ORG_ACCESS_KEY: E2E_ORG_ACCESS_KEY,
  BEARER_TOKEN: E2E_BEARER_TOKEN,
  SESSION_SECRET: E2E_SESSION_SECRET,
  PORT: String(E2E_PORT),
  NODE_ENV: "development",
};

// The one Employee row this suite depends on. Global setup seeds
// exactly this record into an otherwise-empty test database — not
// prisma/seed.ts's full mock dataset — so scenarios can match on this
// employee's name/email without any risk of colliding with unrelated
// random seed data.
export const E2E_TEST_EMPLOYEE = {
  email: "e2e.agent@insider-shield.dev",
  name: "E2E Test Agent",
  department: "Quality Assurance",
  riskScore: 40,
  status: "active",
};

// Attributed as the dashboard session's operator at login, so the Audit
// Trail scenario can assert the same actor shows up across the
// login/policy/revoke rows.
export const E2E_OPERATOR_EMAIL = "e2e-operator@insider-shield.dev";
