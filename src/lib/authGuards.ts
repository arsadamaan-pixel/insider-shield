import { NextResponse } from "next/server";
import { ORG_ACCESS_KEY_HEADER, hasValidDashboardSession, isValidOrgAccessKey } from "@/lib/auth";

// Route Handler-only convenience wrappers — kept out of src/lib/auth.ts
// because that module is also imported by server.ts (loaded via tsx,
// outside Next's own bootstrap), where importing "next/server" at
// module-eval time crashes with an AsyncLocalStorage error. Route
// Handlers are always loaded lazily through Next's own request
// pipeline, so importing "next/server" here is safe.

export function requireOrgAccessKey(request: Request): NextResponse | null {
  if (!isValidOrgAccessKey(request.headers.get(ORG_ACCESS_KEY_HEADER))) {
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
