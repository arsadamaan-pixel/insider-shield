import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// IAM lifecycle writes (Add/Edit/permanent Delete) — mirrors
// src/lib/agentTokens.ts's shape: plain functions, zero
// "next/server"/"next/headers" imports, since server.ts imports
// modules like this one at top level via tsx, before next({...}) runs.

export class DuplicateEmployeeEmailError extends Error {
  constructor(email: string) {
    super(`an employee with email "${email}" already exists`);
    this.name = "DuplicateEmployeeEmailError";
  }
}

export interface CreateEmployeeInput {
  name: string;
  email: string;
  department: string;
  title?: string;
  riskScore: number;
}

export async function createEmployee(input: CreateEmployeeInput) {
  try {
    return await prisma.employee.create({
      data: {
        name: input.name,
        email: input.email,
        department: input.department,
        title: input.title ?? null,
        riskScore: input.riskScore,
        status: "active",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmployeeEmailError(input.email);
    }
    throw err;
  }
}

export interface UpdateEmployeeProfileInput {
  name?: string;
  department?: string;
  title?: string | null;
  riskScore?: number;
}

// Profile fields only — never `email` (plain-string join key threaded
// through Heartbeat/DlpAlert/wsRegistry, not FK-enforced, so changing
// it would silently orphan history) or `status` (has its own dedicated
// offboard flow with session-termination side effects that a generic
// edit must not bypass).
export async function updateEmployeeProfile(id: string, input: UpdateEmployeeProfileInput) {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return null;

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      name: input.name,
      department: input.department,
      title: input.title,
      riskScore: input.riskScore,
    },
  });
  return { before: existing, after: updated };
}

export interface DeletedEmployeeResult {
  email: string;
  department: string;
  deletedHeartbeats: number;
}

// Permanently removes the Employee row and their Heartbeat (telemetry
// noise) history. Deliberately does NOT touch DlpAlert or AuditLog rows
// for this email — those are security/compliance evidence, not "the
// employee's data," and stay queryable by email after this runs.
// Also clears ProvisioningToken.employeeId for any tokens pointing at
// this row (data hygiene — otherwise /provisioning would show a broken
// employee reference) without touching the tokens themselves.
export async function deleteEmployeePermanently(id: string): Promise<DeletedEmployeeResult | null> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return null;

  const [{ count: deletedHeartbeats }] = await prisma.$transaction([
    prisma.heartbeat.deleteMany({ where: { employeeEmail: existing.email } }),
    prisma.provisioningToken.updateMany({ where: { employeeId: id }, data: { employeeId: null } }),
    prisma.employee.delete({ where: { id } }),
  ]);

  return { email: existing.email, department: existing.department, deletedHeartbeats };
}
