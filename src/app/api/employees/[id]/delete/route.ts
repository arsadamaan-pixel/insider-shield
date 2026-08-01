import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { deleteEmployeePermanently } from "@/lib/employees";
import { terminateEmployeeSessions } from "@/lib/wsRegistry";
import { logAuditEvent } from "@/lib/auditLog";

// Permanently removes the employee row and their Heartbeat history.
// DlpAlert and AuditLog rows for this email are deliberately kept —
// see src/lib/employees.ts's deleteEmployeePermanently() header
// comment. Any live session is force-closed first (mirrors the
// existing offboard route's terminateEmployeeSessions() call, just
// more final since the employee record itself won't exist afterward
// for a future reconnect to even be checked against).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  const { id } = await params;

  const result = await deleteEmployeePermanently(id);
  if (!result) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const terminatedSessions = terminateEmployeeSessions(result.email);

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "employee_deleted",
    targetResource: result.email,
    details: { department: result.department, deletedHeartbeats: result.deletedHeartbeats, terminatedSessions },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({ status: "deleted", deletedHeartbeats: result.deletedHeartbeats, terminatedSessions });
}
