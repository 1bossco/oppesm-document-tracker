import { NextResponse } from "next/server";
import {
  ADMIN_NAME_COOKIE,
  SESSION_COOKIE,
  expectedSessionToken,
  isAuthEnabled,
  isCorrectPassword,
} from "@/lib/auth";
import { getStaff } from "@/lib/staff";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function POST(request: Request) {
  let password = "";
  let name = "";
  try {
    const body = await request.json();
    password = String(body?.password ?? "");
    name = String(body?.name ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const staff = await getStaff();
  if (!name || !staff.some((s) => s.name === name)) {
    return NextResponse.json({ error: "Please select your name." }, { status: 400 });
  }

  if (isAuthEnabled() && !(await isCorrectPassword(password))) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  if (isAuthEnabled()) {
    response.cookies.set(SESSION_COOKIE, (await expectedSessionToken()) ?? "", COOKIE_OPTIONS);
  }
  response.cookies.set(ADMIN_NAME_COOKIE, name, COOKIE_OPTIONS);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(ADMIN_NAME_COOKIE);
  return response;
}
