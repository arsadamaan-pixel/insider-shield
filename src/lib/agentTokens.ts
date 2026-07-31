import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isValidOrgAccessKey } from "@/lib/auth";
import type { ProvisioningToken } from "@/types";

// Per-device provisioning tokens (Phase 8 — "Enterprise Provisioning").
// Zero "next/server"/"next/headers" imports here, same constraint as
// src/lib/auth.ts: server.ts imports this module at top level via tsx,
// before next({...}) runs.
//
// Only a SHA-256 hash of the raw token is ever persisted (see
// prisma/schema.prisma's ProvisioningToken model) — the raw value comes
// back from createProvisioningToken() exactly once, at creation time.

const TOKEN_PREFIX = "ist_";
const PREFIX_DISPLAY_LENGTH = 12; // "ist_" + 8 chars — enough to tell tokens apart, not enough to brute-force

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString("base64url");
}

export interface CreateProvisioningTokenInput {
  employeeId?: string;
  deviceName?: string;
  expirationDays?: number;
  createdBy?: string;
}

export class UnknownEmployeeError extends Error {
  constructor(employeeId: string) {
    super(`no employee found with id "${employeeId}"`);
    this.name = "UnknownEmployeeError";
  }
}

export async function createProvisioningToken(input: CreateProvisioningTokenInput) {
  if (input.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new UnknownEmployeeError(input.employeeId);
  }

  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const tokenPrefix = raw.slice(0, PREFIX_DISPLAY_LENGTH);
  const expiresAt =
    input.expirationDays && input.expirationDays > 0
      ? new Date(Date.now() + input.expirationDays * 24 * 60 * 60 * 1000)
      : null;

  const record = await prisma.provisioningToken.create({
    data: {
      tokenHash,
      tokenPrefix,
      employeeId: input.employeeId ?? null,
      deviceName: input.deviceName ?? null,
      expiresAt,
      createdBy: input.createdBy,
    },
  });

  return { raw, record };
}

export async function listProvisioningTokens(): Promise<ProvisioningToken[]> {
  const [tokens, employees] = await Promise.all([
    prisma.provisioningToken.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const now = new Date();

  return tokens.map((t) => ({
    id: t.id,
    tokenPrefix: t.tokenPrefix,
    employeeId: t.employeeId,
    employeeName: t.employeeId ? (nameById.get(t.employeeId) ?? "Unknown employee") : null,
    deviceName: t.deviceName,
    status: t.status as "active" | "revoked",
    isExpired: Boolean(t.expiresAt && t.expiresAt < now),
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
  }));
}

export async function revokeProvisioningToken(id: string) {
  const existing = await prisma.provisioningToken.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.provisioningToken.update({
    where: { id },
    data: { status: "revoked", revokedAt: new Date() },
  });
}

export interface AgentCredentialResult {
  valid: boolean;
  // Set only when a per-device provisioning token (not the static
  // org-wide key) authenticated — lets the caller register this
  // connection against that specific token for later revocation.
  tokenId?: string;
}

// Checked in this order deliberately: the static ORG_ACCESS_KEY first
// (cheap string comparison, no DB hit, preserves exact prior behavior
// for any agent still using it) before falling back to a per-device
// token lookup. Updates lastUsedAt on a successful token match.
export async function verifyAgentCredential(candidate: string | null | undefined): Promise<AgentCredentialResult> {
  if (!candidate) return { valid: false };
  if (isValidOrgAccessKey(candidate)) return { valid: true };

  const tokenHash = hashToken(candidate);
  const record = await prisma.provisioningToken.findUnique({ where: { tokenHash } });
  if (!record) return { valid: false };
  if (record.status !== "active") return { valid: false };
  if (record.expiresAt && record.expiresAt < new Date()) return { valid: false };

  await prisma.provisioningToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {
    // best-effort — a failure to record last-used must never block a
    // credential that otherwise checked out
  });

  return { valid: true, tokenId: record.id };
}
