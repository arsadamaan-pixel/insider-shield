import { NextResponse } from "next/server";
import { getClientIp, getSessionOperator } from "@/lib/auth";
import { requireDashboardSession } from "@/lib/authGuards";
import { createEmployee, DuplicateEmployeeEmailError } from "@/lib/employees";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const authError = requireDashboardSession(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const department = typeof b.department === "string" ? b.department.trim() : "";
  const title = typeof b.title === "string" && b.title.trim() ? b.title.trim() : undefined;
  const riskScore = typeof b.riskScore === "number" ? b.riskScore : Number(b.riskScore);

  if (!name || !email || !department) {
    return NextResponse.json({ error: "name, email, and department are required" }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "email is not a valid address" }, { status: 400 });
  }
  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 100) {
    return NextResponse.json({ error: "riskScore must be a number between 0 and 100" }, { status: 400 });
  }

  let employee;
  try {
    employee = await createEmployee({ name, email, department, title, riskScore });
  } catch (err) {
    if (err instanceof DuplicateEmployeeEmailError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const operator = getSessionOperator(request.headers.get("cookie")) ?? "dashboard-ui";
  await logAuditEvent({
    actorEmail: operator,
    action: "employee_created",
    targetResource: employee.email,
    details: { id: employee.id, department: employee.department },
    ipAddress: getClientIp(request),
  });

  return NextResponse.json(
    {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      department: employee.department,
      title: employee.title,
      riskScore: employee.riskScore,
      status: employee.status,
      createdAt: employee.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
