import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { generateMockEmployees, generateMockDlpAlerts } from "../src/lib/mockData";

// Populates the local SQLite database with the same synthetic data the
// dashboard previously rendered straight from mockData.ts in-memory —
// see PLAN.md Phase 3/"SQLite Data Persistence" for context. Safe to
// re-run: it wipes and re-seeds rather than accumulating duplicates.

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const DEFAULT_POLICY: Record<string, unknown> = {
  dlpEnabled: false,
  transmitEvents: false,
  sensitivePatterns: [
    { name: "credit_card_like", pattern: "\\b(?:\\d[ -]*?){13,16}\\b" },
    { name: "ssn_like", pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b" },
    { name: "api_key_like", pattern: "\\b(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\\b" },
  ],
  heartbeatIntervalMs: 30000,
  wsEndpoint: "ws://localhost:3000/api/ws",
};

async function main() {
  console.log("[seed] clearing existing rows...");
  await prisma.dlpAlert.deleteMany();
  await prisma.heartbeat.deleteMany();
  await prisma.systemPolicy.deleteMany();
  await prisma.employee.deleteMany();

  const mockEmployees = generateMockEmployees();
  const mockAlerts = generateMockDlpAlerts(mockEmployees);
  const emailById = new Map(mockEmployees.map((e) => [e.id, e.email]));

  console.log(`[seed] inserting ${mockEmployees.length} employees...`);
  await prisma.employee.createMany({
    data: mockEmployees.map((e) => ({
      name: e.fullName,
      email: e.email,
      department: e.department,
      riskScore: e.riskScore,
      status: e.status,
      createdAt: new Date(e.lastSeenAt),
    })),
  });

  console.log(`[seed] inserting ${mockAlerts.length} DLP alerts...`);
  await prisma.dlpAlert.createMany({
    data: mockAlerts.map((a) => ({
      timestamp: new Date(a.ts),
      severity: a.severity,
      employeeEmail: emailById.get(a.employeeId) ?? "unknown@insider-shield.dev",
      ruleTriggered: a.ruleName,
      // Metadata-only description — never the raw matched text.
      snippet: `DLP rule "${a.ruleName}" triggered on ${a.hostname}`,
      redactedContent: a.excerptRedacted,
      sourceUrl: a.hostname,
      geoViolation: a.geoViolation,
      acknowledged: a.acknowledged,
    })),
  });

  console.log("[seed] inserting default SystemPolicy key/value rows...");
  await prisma.systemPolicy.createMany({
    data: Object.entries(DEFAULT_POLICY).map(([key, value]) => ({
      key,
      value: JSON.stringify(value),
      updatedBy: "seed-script",
    })),
  });

  console.log("[seed] inserting sample heartbeats...");
  const boundEmployees = mockEmployees.filter((e) => e.managedDeviceId);
  const heartbeats = boundEmployees.slice(0, 10).flatMap((e, i) =>
    Array.from({ length: 5 }, (_, j) => ({
      orgKey: `dev-seed-${i}`,
      platform: JSON.stringify({ os: "linux", arch: "x86-64" }),
      timestamp: new Date(Date.now() - j * 5 * 60 * 1000),
      status: "open",
    }))
  );
  await prisma.heartbeat.createMany({ data: heartbeats });

  console.log("[seed] done.");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
