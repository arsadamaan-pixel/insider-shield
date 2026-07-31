import { NextResponse } from "next/server";
import { ORG_ACCESS_KEY_HEADER, hasValidDashboardSession } from "@/lib/auth";
import { verifyAgentCredential } from "@/lib/agentTokens";

// Route Handler-only convenience wrappers — kept out of src/lib/auth.ts
// because that module is also imported by server.ts (loaded via tsx,
// outside Next's own bootstrap), where importing "next/server" at
// module-eval time crashes with an AsyncLocalStorage error. Route
// Handlers are always loaded lazily through Next's own request
// pipeline, so importing "next/server" here is safe.

// Async since Phase 8: accepts either the static ORG_ACCESS_KEY or a
// per-device ProvisioningToken (verifyAgentCredential() checks the
// static key first, no DB hit, before falling back to a token lookup).
export async function requireOrgAccessKey(request: Request): Promise<NextResponse | null> {
  const credential = await verifyAgentCredential(request.headers.get(ORG_ACCESS_KEY_HEADER));
  if (!credential.valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function requireDashboardSession(request: Request): NextResponse | null {
  if (!hasValidDashboardSession(request.headers.get("cookie"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
