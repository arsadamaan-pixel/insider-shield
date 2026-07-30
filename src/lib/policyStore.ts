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

// Shared between the REST OTA endpoint (src/app/api/policies/route.ts)
// and the WebSocket dashboard-message handler (server.ts). Shape here
// must stay in sync with the allow-listed fields
// extension/background/background.js's handleRemoteMessage() accepts —
// that function deliberately rejects anything outside these keys and
// never executes code from a policy payload.

const ALLOWED_KEYS: (keyof SystemPolicy)[] = [
  "dlpEnabled",
  "transmitEvents",
  "sensitivePatterns",
  "heartbeatIntervalMs",
  "wsEndpoint",
];

function isValidPatternList(value: unknown): value is SensitivePatternRule[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as SensitivePatternRule).name === "string" &&
        typeof (item as SensitivePatternRule).pattern === "string"
    )
  );
}

export function sanitizePolicyUpdate(body: unknown): Partial<SystemPolicy> | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const update: Partial<SystemPolicy> = {};

  for (const key of ALLOWED_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];

    switch (key) {
      case "dlpEnabled":
      case "transmitEvents":
        if (typeof value === "boolean") update[key] = value;
        break;
      case "heartbeatIntervalMs":
        if (typeof value === "number" && value >= 1000) update[key] = value;
        break;
      case "wsEndpoint":
        if (typeof value === "string") update[key] = value;
        break;
      case "sensitivePatterns":
        if (isValidPatternList(value)) update[key] = value;
        break;
    }
  }

  return update;
}

export type { SensitivePatternRule };
