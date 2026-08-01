import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { updateEmployeeProfile } from "@/lib/employees";
import { logAuditEvent } from "@/lib/auditLog";

// Profile fields only (name/department/title/riskScore) — email and
// status are deliberately not editable here, see src/lib/employees.ts's
// updateEmployeeProfile() header comment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : undefined;
  const department = typeof b.department === "string" && b.department.trim() ? b.department.trim() : undefined;
  const title = typeof b.title === "string" ? (b.title.trim() || null) : undefined;

  let riskScore: number | undefined;
  if (b.riskScore !== undefined) {
    const parsed = typeof b.riskScore === "number" ? b.riskScore : Number(b.riskScore);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return NextResponse.json({ error: "riskScore must be a number between 0 and 100" }, { status: 400 });
    }
    riskScore = parsed;
  }

  const result = await updateEmployeeProfile(id, { name, department, title, riskScore });
  if (!result) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "employee_updated",
    targetResource: result.after.email,
    details: {
      before: { name: result.before.name, department: result.before.department, title: result.before.title, riskScore: result.before.riskScore },
      after: { name: result.after.name, department: result.after.department, title: result.after.title, riskScore: result.after.riskScore },
    },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json({
    id: result.after.id,
    name: result.after.name,
    email: result.after.email,
    department: result.after.department,
    title: result.after.title,
    riskScore: result.after.riskScore,
    status: result.after.status,
  });
}
