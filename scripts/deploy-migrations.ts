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
//    this applies each migration's SQL statements one at a time via
//    `@libsql/client`, tracking what's already been applied in a small
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
//
// Statement-by-statement, not one executeMultiple() call per file, and
// "already exists"/"duplicate column" errors are treated as already-
// satisfied rather than fatal: the production Turso database already
// had Employee/DlpAlert/SystemPolicy/Heartbeat (created manually via
// `turso db shell` during initial setup, before this script existed) —
// this table-by-table tracking has no record of that, and the first
// real deploy failed outright on `CREATE TABLE "Employee"` because of
// it. Running executeMultiple() per *file* would have the same
// problem one level up: it aborts the whole file at the first failing
// statement, so if only some of a migration's tables/columns already
// exist, the rest (which may genuinely be missing) would never get a
// chance to run. Per-statement is the only granularity that correctly
// handles "some of this migration's effects already exist, some
// don't" without either re-erroring on the former or skipping the
// latter.

const TRACKING_TABLE = "_deploy_migrations";

function isRemoteLibsqlUrl(url: string): boolean {
  return url.startsWith("libsql://") || url.startsWith("http://") || url.startsWith("https://");
}

// Matches SQLite/libsql's wording for "this DDL was already applied"
// (`table "X" already exists`, `index "X" already exists`, `duplicate
// column name: X`) — deliberately narrow, so a genuinely different
// error (a typo, a real syntax problem, a permissions issue) still
// fails loudly instead of being silently swallowed.
const ALREADY_APPLIED_PATTERNS = [/already exists/i, /duplicate column name/i];

function isAlreadyAppliedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return ALREADY_APPLIED_PATTERNS.some((pattern) => pattern.test(message));
}

// Splits a Prisma-generated migration.sql into individual statements.
// Not a general-purpose SQL parser — relies on Prisma's own migration
// files being simple DDL with no semicolons inside string literals
// (true of every migration in prisma/migrations/ today; verified by
// inspection, not assumed).
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => {
      if (statement.length === 0) return false;
      // Every real statement here starts with a `-- CreateTable`-style
      // comment header line — SQLite parses that fine as part of the
      // statement text, so it must NOT be filtered out just for
      // starting with "--". Only drop a chunk if it has no actual SQL
      // content left after stripping comment-only lines (a defensive
      // edge case, not expected in any current migration file).
      const withoutComments = statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return withoutComments.length > 0;
    });
}

export async function applyViaLibsql(databaseUrl: string, authToken: string | undefined): Promise<void> {
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
      const statements = splitStatements(readFileSync(sqlPath, "utf8"));

      for (const statement of statements) {
        try {
          await client.execute(statement);
        } catch (err) {
          if (isAlreadyAppliedError(err)) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[deploy-migrations] ${folder}: already satisfied (${message}), skipping this statement`);
            continue;
          }
          throw err;
        }
      }

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

// Guarded so importing applyViaLibsql()/splitStatements() etc. for a
// test doesn't also trigger this script's own CLI behavior as a side
// effect of the import — the Dockerfile CMD and every real invocation
// always run this file directly (`npx tsx scripts/deploy-migrations.ts`),
// never import it.
if (require.main === module) {
  main().catch((err) => {
    console.error("[deploy-migrations] failed:", err);
    process.exit(1);
  });
}
