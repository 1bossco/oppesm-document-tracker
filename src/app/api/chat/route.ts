import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { addChat, deleteChat, editChat, getChat } from "@/lib/chat";
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
    // Use the backend's Id so the message can be edited/unsent right away.
    const id = (result.data as { id?: string })?.id;
    return NextResponse.json({ ok: true, item: { ...item, id: id || item.id } });
  } catch {
    return NextResponse.json({ error: "Unable to post message." }, { status: 500 });
  }
}

// Edit a message: { controlNo, id, message, user }
export async function PATCH(request: Request) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    const id = String(body?.id ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const user = String(body?.user ?? "").trim();
    if (!controlNo || !id) return NextResponse.json({ error: "A message id is required." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "The message can't be empty." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Pick your name first." }, { status: 400 });

    if (!isBackendConnected()) {
      return NextResponse.json({ ok: true, editedAt: new Date().toISOString(), demo: true });
    }
    const result = await editChat(controlNo, id, message, user);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not edit." }, { status: 502 });
    const data = result.data as { editedAt?: string; originalMessage?: string };
    return NextResponse.json({ ok: true, editedAt: data?.editedAt ?? "", originalMessage: data?.originalMessage ?? "" });
  } catch {
    return NextResponse.json({ error: "Unable to edit message." }, { status: 500 });
  }
}

// Unsend a message: { controlNo, id, user }
export async function DELETE(request: Request) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    const id = String(body?.id ?? "").trim();
    const user = String(body?.user ?? "").trim();
    if (!controlNo || !id) return NextResponse.json({ error: "A message id is required." }, { status: 400 });
    if (!user) return NextResponse.json({ error: "Pick your name first." }, { status: 400 });

    if (!isBackendConnected()) {
      return NextResponse.json({ ok: true, deletedAt: new Date().toISOString(), demo: true });
    }
    const result = await deleteChat(controlNo, id, user);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not unsend." }, { status: 502 });
    return NextResponse.json({ ok: true, deletedAt: (result.data as { deletedAt?: string })?.deletedAt ?? "" });
  } catch {
    return NextResponse.json({ error: "Unable to unsend message." }, { status: 500 });
  }
}
