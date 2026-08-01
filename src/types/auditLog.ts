// Client-safe: no server imports (unlike src/lib/auditLog.ts, which
// pulls in @/lib/prisma and cannot be imported from "use client" code).

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO
  actorEmail: string;
  action: string;
  targetResource: string;
  details: unknown | null; // decoded detailsJson
  ipAddress: string | null;
}

// Known action values, used by the Audit page's filter <select>.
export const AUDIT_ACTIONS = [
  "policy_update",
  "employee_revoked",
  "dlp_event_ingested",
  "login_succeeded",
  "login_failed",
  "agent_auth_failed",
  "dashboard_auth_failed",
  "provisioning_token_created",
  "provisioning_token_revoked",
  "endpoint_deleted",
  "endpoint_renamed",
  "employee_created",
  "employee_updated",
  "employee_deleted",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
