// Client-safe: no server imports (unlike src/lib/agentTokens.ts, which
// pulls in @/lib/prisma and cannot be imported from "use client" code).

export type ProvisioningTokenStatus = "active" | "revoked";

export interface ProvisioningToken {
  id: string;
  tokenPrefix: string;
  employeeId: string | null;
  employeeName: string | null;
  deviceName: string | null;
  status: ProvisioningTokenStatus;
  isExpired: boolean;
  createdBy: string | null;
  createdAt: string; // ISO
  expiresAt: string | null; // ISO
  revokedAt: string | null; // ISO
  lastUsedAt: string | null; // ISO
}

// Returned once, at creation time, from POST /api/admin/provision-token
// — includes the raw `token` value, which is never retrievable again.
export interface NewProvisioningToken {
  id: string;
  token: string;
  tokenPrefix: string;
  employeeId: string | null;
  deviceName: string | null;
  status: "active";
  createdAt: string;
  expiresAt: string | null;
}

// Minimal employee shape the token generator's employee picker needs —
// not the full EnrichedEmployee.
export interface ProvisioningEmployeeOption {
  id: string;
  name: string;
  email: string;
}
