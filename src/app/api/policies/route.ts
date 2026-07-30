import { NextResponse } from "next/server";
import { getPolicy, sanitizePolicyUpdate, setPolicy } from "@/lib/policyStore";

// OTA policy distribution endpoint. Validation logic lives in
// src/lib/policyStore.ts (sanitizePolicyUpdate), shared with the
// WebSocket dashboard-message handler in server.ts. Kept as a REST
// fallback/testing path and for the Policy Control Panel's offline
// fallback now that the real-time WebSocket transport (server.ts)
// exists.

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

  const update = sanitizePolicyUpdate(body);
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
