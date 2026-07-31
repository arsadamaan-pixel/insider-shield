import { test, expect } from "@playwright/test";
import { createClient } from "@libsql/client";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { applyViaLibsql } from "../scripts/deploy-migrations";

// Standalone unit-style coverage for scripts/deploy-migrations.ts —
// not related to the running Next.js/WS server (unlike every other
// spec in this directory), just co-located here since this project
// has one test runner. Uses @libsql/client's local `file:` mode (a
// real libsql client, just pointed at a local file instead of Turso)
// so this exercises the *exact* code path production uses, without
// needing real Turso credentials.
//
// Added after two real bugs shipped in this script undetected by
// manual/ad-hoc verification: a dropped function definition, and a
// statement filter that silently rejected every real statement (every
// one starts with a `-- CreateTable`-style comment line) — meaning
// every migration "succeeded" while actually running zero SQL. The
// second bug is exactly what test 3 below guards against: Employee
// existing already (from the original manual Turso bootstrap, before
// this script existed) must not prevent the *other* tables in that
// same migration file from being created.

const TEST_DB_PATH = path.join(__dirname, "..", "prisma", "deploy-migrations-test.db");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;
const EXPECTED_TABLES = ["AuditLog", "DlpAlert", "Employee", "Heartbeat", "ProvisioningToken", "SystemPolicy"];

function cleanupDbFile() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${TEST_DB_PATH}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
}

async function getTableNames(): Promise<string[]> {
  const client = createClient({ url: TEST_DB_URL });
  try {
    const result = await client.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    return result.rows.map((row) => String(row.name));
  } finally {
    client.close();
  }
}

test.describe("scripts/deploy-migrations.ts — applyViaLibsql", () => {
  test.beforeEach(() => cleanupDbFile());
  test.afterAll(() => cleanupDbFile());

  test("applies every migration cleanly to a brand-new database", async () => {
    await applyViaLibsql(TEST_DB_URL, "unused-for-local-file-scheme");
    const tables = await getTableNames();
    for (const expected of EXPECTED_TABLES) {
      expect(tables).toContain(expected);
    }
  });

  test("is idempotent — a second run against an already-migrated database does not throw", async () => {
    await applyViaLibsql(TEST_DB_URL, "unused-for-local-file-scheme");
    await expect(applyViaLibsql(TEST_DB_URL, "unused-for-local-file-scheme")).resolves.toBeUndefined();
  });

  test("recovers when some tables already exist from before _deploy_migrations tracking existed", async () => {
    // Reproduces the real production incident: Employee pre-exists
    // (created manually, outside this script's tracking), but
    // DlpAlert/SystemPolicy/Heartbeat from that same migration file do
    // not exist yet.
    const seedClient = createClient({ url: TEST_DB_URL });
    await seedClient.execute(`CREATE TABLE "Employee" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "department" TEXT NOT NULL,
      "riskScore" INTEGER NOT NULL,
      "status" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    seedClient.close();

    await applyViaLibsql(TEST_DB_URL, "unused-for-local-file-scheme");

    const tables = await getTableNames();
    for (const expected of EXPECTED_TABLES) {
      expect(tables).toContain(expected);
    }
  });
});
