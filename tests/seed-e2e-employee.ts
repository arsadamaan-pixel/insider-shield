import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { E2E_ENV, E2E_TEST_EMPLOYEE } from "./env";

// Run as its own `tsx` child process by global-setup.ts, rather than
// dynamically imported into Playwright's own config/setup module graph
// directly — Prisma 7's generated client (src/generated/prisma/client.ts)
// is emitted as an ES module with `import.meta.url` at its top, and
// importing it from inside Playwright's transpiled setup file throws
// "Cannot require() ES Module ... in a cycle". Running it the same way
// prisma/seed.ts already does (a plain `tsx` process) sidesteps that
// entirely.

async function main() {
  const adapter = new PrismaBetterSqlite3({ url: E2E_ENV.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.employee.create({ data: E2E_TEST_EMPLOYEE });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-e2e-employee] failed:", err);
  process.exitCode = 1;
});
