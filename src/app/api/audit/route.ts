import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { getAuditTrail } from "@/lib/audit";

async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(token);
}

export async function GET() {
  if (!(await requireSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json(await getAuditTrail());
}
