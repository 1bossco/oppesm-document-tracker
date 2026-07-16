import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { addChat, getChat } from "@/lib/chat";
import { isBackendConnected } from "@/lib/sheet";

async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(token);
}
const unauthorized = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });

export async function GET(request: Request) {
  if (!(await requireSession())) return unauthorized();
  const controlNo = new URL(request.url).searchParams.get("controlNo") ?? "";
  if (!controlNo) return NextResponse.json({ error: "A control number is required." }, { status: 400 });
  return NextResponse.json(await getChat(controlNo));
}

export async function POST(request: Request) {
  if (!(await requireSession())) return unauthorized();

  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    const author = String(body?.author ?? "").trim();
    const message = String(body?.message ?? "").trim();

    if (!controlNo) return NextResponse.json({ error: "A control number is required." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "A message is required." }, { status: 400 });

    const item = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      controlNo,
      author: author || "Unknown",
      message,
      createdAt: new Date().toISOString(),
    };

    if (!isBackendConnected()) return NextResponse.json({ ok: true, item, demo: true });

    const result = await addChat(controlNo, item.author, message);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not post." }, { status: 502 });
    return NextResponse.json({ ok: true, item });
  } catch {
    return NextResponse.json({ error: "Unable to post message." }, { status: 500 });
  }
}
