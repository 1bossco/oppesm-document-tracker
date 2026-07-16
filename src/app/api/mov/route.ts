import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { addMov, getMov } from "@/lib/mov";
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
  return NextResponse.json(await getMov(controlNo));
}

export async function POST(request: Request) {
  if (!(await requireSession())) return unauthorized();

  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    const uploadedBy = String(body?.uploadedBy ?? "").trim();
    const note = String(body?.note ?? "").trim();
    const file = body?.file as { name: string; type: string; data: string } | undefined;

    if (!controlNo) return NextResponse.json({ error: "A control number is required." }, { status: 400 });
    if (!file?.name || !file?.data) return NextResponse.json({ error: "A file is required." }, { status: 400 });

    const item = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      controlNo,
      uploadedBy: uploadedBy || "Unknown",
      fileName: file.name,
      fileUrl: "#",
      note,
      createdAt: new Date().toISOString(),
    };

    if (!isBackendConnected()) return NextResponse.json({ ok: true, item, demo: true });

    const result = await addMov(controlNo, item.uploadedBy, note, file);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not upload." }, { status: 502 });
    const url = (result.data as { fileUrl?: string })?.fileUrl;
    return NextResponse.json({ ok: true, item: { ...item, fileUrl: url || "#" } });
  } catch {
    return NextResponse.json({ error: "Unable to upload MOV." }, { status: 500 });
  }
}
