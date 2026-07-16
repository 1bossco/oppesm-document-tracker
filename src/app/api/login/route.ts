import { NextResponse } from "next/server";
import { SESSION_COOKIE, expectedSessionToken, isAuthEnabled, isCorrectPassword } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, note: "No admin password is configured." });
  }

  let password = "";
  try {
    const body = await request.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!(await isCorrectPassword(password))) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  const token = await expectedSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
