import { NextResponse } from "next/server";
import type { SensitivePatternRule, SystemPolicy } from "@/types";
import { getPolicy, setPolicy } from "@/lib/policyStore";

// OTA policy distribution endpoint. The shape here must stay in sync
// with the allow-listed fields extension/background/background.js's
// handleRemoteMessage() accepts — that function deliberately rejects
// anything outside { dlpEnabled, transmitEvents, sensitivePatterns,
// heartbeatIntervalMs, wsEndpoint } and never executes code from a
// policy payload.

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

function sanitizeUpdate(body: unknown): Partial<SystemPolicy> | null {
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

export async function GET() {
  const policy = await getPolicy();
  return NextResponse.json(policy);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const update = sanitizeUpdate(body);
  if (!update || Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no recognized policy fields in body" }, { status: 422 });
  }

  const updatedBy =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).updatedBy === "string"
      ? (body as Record<string, string>).updatedBy
      : "unknown"; // no auth wired up yet — see PLAN.md Phase 5

  const updated = await setPolicy(update, updatedBy);
  return NextResponse.json(updated, { status: 200 });
}
