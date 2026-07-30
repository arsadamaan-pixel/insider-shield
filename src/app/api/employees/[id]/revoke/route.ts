import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { terminateEmployeeSessions } from "@/lib/wsRegistry";

// One-shot admin action — plain REST is sufficient here (unlike the
// live-sync PolicyControlPanel case), since wsRegistry.ts's registry is
// shared process-wide state reachable directly from this route handler,
// not something that needs to be routed through a dashboard's own
// WebSocket connection.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  // Status is updated BEFORE terminating sockets, closing the race where
  // an instant reconnect attempt could otherwise slip through while the
  // status is still "active" — server.ts's upgrade handler checks this
  // same status.
  const updated = await prisma.employee.update({
    where: { id },
    data: { status: "offboarded", offboardedAt: new Date() },
  });

  const terminatedSessions = terminateEmployeeSessions(updated.email);

  return NextResponse.json({ status: "revoked", employee: updated, terminatedSessions });
}
