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

  // The first 10 device-bound employees get seeded heartbeats below —
  // computed up front so their matching "most recent" IP can also be
  // denormalized onto the Employee row itself, mirroring what
  // ingestHeartbeat() does for real (non-seeded) heartbeats.
  const boundEmployees = mockEmployees.filter((e) => e.managedDeviceId);
  const latestIpByEmail = new Map(boundEmployees.slice(0, 10).map((e, i) => [e.email, `10.${(i % 254) + 1}.1.${(i % 254) + 1}`]));

  console.log(`[seed] inserting ${mockEmployees.length} employees...`);
  await prisma.employee.createMany({
    data: mockEmployees.map((e) => ({
      name: e.fullName,
      email: e.email,
      department: e.department,
      title: e.title,
      riskScore: e.riskScore,
      status: e.status,
      managedDeviceId: e.managedDeviceId,
      lastSeenAt: new Date(e.lastSeenAt),
      lastKnownIp: latestIpByEmail.get(e.email),
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

  // Guarantees at least one visible red (violation) marker on the Asset
  // Map regardless of what the deterministic mock sequence above
  // happened to produce — demo/dev-quality-of-life, not load-bearing.
  const firstBoundEmployee = mockEmployees.find((e) => e.managedDeviceId);
  if (firstBoundEmployee) {
    await prisma.dlpAlert.create({
      data: {
        timestamp: new Date(),
        severity: "critical",
        employeeEmail: firstBoundEmployee.email,
        ruleTriggered: "ssn_like",
        snippet: `DLP rule "ssn_like" triggered on docs.google.com`,
        redactedContent: "***-**-****",
        sourceUrl: "docs.google.com",
        geoViolation: true,
        acknowledged: false,
      },
    });
  }

  console.log("[seed] inserting default SystemPolicy key/value rows...");
  await prisma.systemPolicy.createMany({
    data: Object.entries(DEFAULT_POLICY).map(([key, value]) => ({
      key,
      value: JSON.stringify(value),
      updatedBy: "seed-script",
    })),
  });

  console.log("[seed] inserting sample heartbeats...");
  const OS_SAMPLES = [
    { os: "mac", arch: "arm64" },
    { os: "win", arch: "x86-64" },
    { os: "linux", arch: "x86-64" },
  ];
  const heartbeats = boundEmployees.slice(0, 10).flatMap((e, i) =>
    // j=0 is the most recent (smallest time offset) — its IP matches
    // latestIpByEmail above, kept identical to what a real ingestHeartbeat()
    // call would have denormalized onto the Employee row.
    Array.from({ length: 5 }, (_, j) => ({
      orgKey: e.managedDeviceId ?? `dev-seed-${i}`,
      employeeEmail: e.email,
      ipAddress: j === 0 ? latestIpByEmail.get(e.email) : `10.${(i % 254) + 1}.${(j % 254) + 1}.${((i + j) % 254) + 1}`,
      platform: JSON.stringify(OS_SAMPLES[i % OS_SAMPLES.length]),
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
