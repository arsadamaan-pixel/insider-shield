import type { SensitivePatternRule, SystemPolicy } from "@/types";
import { prisma } from "@/lib/prisma";

// Backed by the SystemPolicy key/value table (see prisma/schema.prisma).
// Defaults intentionally match extension/background/background.js's
// DEFAULT_POLICY — including the kill switch defaulting OFF — so a
// fresh/un-seeded database still fails closed.
const DEFAULTS: SystemPolicy = {
  dlpEnabled: false,
  transmitEvents: false,
  sensitivePatterns: [],
  heartbeatIntervalMs: 30000,
  wsEndpoint: "ws://localhost:3000/api/ws",
  updatedAt: new Date(0).toISOString(),
};

function decodeValue(key: keyof SystemPolicy, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULTS[key];
  }
}

export async function getPolicy(): Promise<SystemPolicy> {
  const rows = await prisma.systemPolicy.findMany();
  const policy: SystemPolicy = { ...DEFAULTS };
  let latestUpdatedAt = new Date(0);

  for (const row of rows) {
    const key = row.key as keyof SystemPolicy;
    if (key in DEFAULTS) {
      (policy as unknown as Record<string, unknown>)[key] = decodeValue(key, row.value);
    }
    if (row.updatedAt > latestUpdatedAt) latestUpdatedAt = row.updatedAt;
  }

  policy.updatedAt = latestUpdatedAt.toISOString();
  return policy;
}

export async function setPolicy(update: Partial<SystemPolicy>, updatedBy?: string): Promise<SystemPolicy> {
  const entries = Object.entries(update) as [keyof SystemPolicy, unknown][];

  await Promise.all(
    entries
      .filter(([key]) => key !== "updatedAt")
      .map(([key, value]) =>
        prisma.systemPolicy.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value), updatedBy },
          update: { value: JSON.stringify(value), updatedBy },
        })
      )
  );

  return getPolicy();
}

export type { SensitivePatternRule };
