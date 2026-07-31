import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { E2E_DB_PATH, E2E_ENV } from "./env";

// Runs once before the whole suite: resets the dedicated e2e-test.db to
// a clean, migrated, minimally-seeded state. Never touches prisma/dev.db
// (the developer's own local database) — see tests/env.ts for why this
// suite uses its own DB file/port/secrets entirely.
export default async function globalSetup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${E2E_DB_PATH}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  const env = { ...process.env, ...E2E_ENV };
  const repoRoot = path.join(__dirname, "..");

  // Non-interactive, applies existing prisma/migrations/* as-is —
  // exactly what a fresh environment (or CI) would run, no schema
  // drift/prompting like `migrate dev` can trigger.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  // See tests/seed-e2e-employee.ts's header comment for why this runs as
  // its own `tsx` process instead of an in-process dynamic import.
  execFileSync("npx", ["tsx", "tests/seed-e2e-employee.ts"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}
