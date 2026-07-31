import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@libsql/client";

// Applies prisma/migrations/* to whatever DATABASE_URL points at, on
// every container start (see Dockerfile's CMD). Two paths:
//
//  - `file:` (local dev/Docker smoke-testing without Turso configured):
//    delegates to `prisma migrate deploy`, which works fine here — this
//    is the same command used throughout local dev and the e2e test's
//    global-setup.ts.
//
//  - `libsql:`/`http(s):` (Turso, production): does NOT use
//    `prisma migrate deploy`. Confirmed by reproducing it locally
//    (`DATABASE_URL="libsql://fake" npx prisma migrate deploy`) that
//    Prisma's schema-engine rejects the scheme outright —
//    `P1013: The provided database string is invalid. The scheme is
//    not recognized`. Prisma's driver-adapter system
//    (`@prisma/adapter-libsql`) only covers the generated Client at
//    runtime; the separate Migrate/schema-engine tooling has no
//    driver-adapter hook at all (checked @prisma/config's type
//    definitions — its `datasource` shape is just `{url,
//    shadowDatabaseUrl}`, nothing else). So for a libsql/Turso target,
//    this applies each migration's raw SQL directly via
//    `@libsql/client`'s `executeMultiple()` — documented by libsql
//    itself as "intended to be used with existing SQL scripts, such as
//    migrations" — tracking what's already been applied in a small
//    tracking table of our own (`_deploy_migrations`, deliberately not
//    named `_prisma_migrations` — this path doesn't use Prisma's own
//    migration state at all, and pretending otherwise would be
//    misleading).
//
// This does mean the two paths track "already applied" state
// independently (Prisma's own `_prisma_migrations` table for `file:`,
// `_deploy_migrations` here for libsql) — an inherent consequence of
// Prisma Migrate not supporting libsql, not a design choice made for
// its own sake.

const TRACKING_TABLE = "_deploy_migrations";

function isRemoteLibsqlUrl(url: string): boolean {
  return url.startsWith("libsql://") || url.startsWith("http://") || url.startsWith("https://");
}

async function applyViaLibsql(databaseUrl: string, authToken: string | undefined): Promise<void> {
  if (!authToken) {
    console.error(
      "[deploy-migrations] DATABASE_URL looks like a remote libsql/Turso URL but TURSO_AUTH_TOKEN is not set — refusing to proceed."
    );
    process.exit(1);
  }

  const client = createClient({ url: databaseUrl, authToken });

  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    );

    const appliedResult = await client.execute(`SELECT name FROM ${TRACKING_TABLE}`);
    const applied = new Set(appliedResult.rows.map((row) => String(row.name)));

    const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
    const folders = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const folder of folders) {
      if (applied.has(folder)) {
        console.log(`[deploy-migrations] ${folder} already applied, skipping`);
        continue;
      }

      const sqlPath = path.join(migrationsDir, folder, "migration.sql");
      if (!existsSync(sqlPath)) continue;

      console.log(`[deploy-migrations] applying ${folder}...`);
      const sql = readFileSync(sqlPath, "utf8");
      await client.executeMultiple(sql);
      await client.execute({ sql: `INSERT INTO ${TRACKING_TABLE} (name) VALUES (?)`, args: [folder] });
      console.log(`[deploy-migrations] applied ${folder}`);
    }
  } finally {
    client.close();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[deploy-migrations] DATABASE_URL is not set — cannot apply migrations.");
    process.exit(1);
  }

  if (isRemoteLibsqlUrl(databaseUrl)) {
    console.log("[deploy-migrations] remote libsql/Turso database detected — applying via @libsql/client.");
    await applyViaLibsql(databaseUrl, process.env.TURSO_AUTH_TOKEN);
  } else {
    console.log("[deploy-migrations] local file: database — delegating to `prisma migrate deploy`.");
    execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
  }

  console.log("[deploy-migrations] done.");
}

main().catch((err) => {
  console.error("[deploy-migrations] failed:", err);
  process.exit(1);
});
