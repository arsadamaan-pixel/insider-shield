import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Standard Next.js dev-mode singleton: avoids exhausting SQLite
// connections from a new PrismaClient being created on every hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Local dev / CI (Phase 2/3/6): a plain file: URL, opened via
// better-sqlite3 (native binary, no network). Production (Phase 7): a
// libsql:// or https:// URL — Turso's free-tier hosted SQLite, opened
// via the libsql driver adapter (same "sqlite" Prisma provider either
// way; only the driver adapter differs — no schema/migration changes
// needed to move between them). TURSO_AUTH_TOKEN is required for the
// libsql path and ignored otherwise; see README.md's deployment section.
function isRemoteLibsqlUrl(url: string): boolean {
  return url.startsWith("libsql://") || url.startsWith("https://") || url.startsWith("http://");
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";

  if (isRemoteLibsqlUrl(url)) {
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!authToken) {
      throw new Error(
        "DATABASE_URL looks like a remote libsql/Turso URL but TURSO_AUTH_TOKEN is not set — see README.md's deployment section."
      );
    }
    const adapter = new PrismaLibSql({ url, authToken });
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
