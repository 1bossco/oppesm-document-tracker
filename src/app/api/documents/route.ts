import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import {
  deleteDocument,
  getDocuments,
  markAsPrinted,
  updateDocumentField,
} from "@/lib/documents";
import { isBackendConnected } from "@/lib/sheet";

async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(token);
}

const unauthorized = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });
const notConnected = () =>
  NextResponse.json({ error: "The spreadsheet backend is not connected." }, { status: 503 });

export async function GET() {
  if (!(await requireSession())) return unauthorized();
  return NextResponse.json(await getDocuments());
}

// Update a single field (progress / statusDoc / printStatus).
export async function PATCH(request: Request) {
  if (!(await requireSession())) return unauthorized();
  if (!isBackendConnected()) return notConnected();

  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    const field = String(body?.field ?? "");
    const value = String(body?.value ?? "");

    if (!controlNo) {
      return NextResponse.json({ error: "A control number is required." }, { status: 400 });
    }
    if (field !== "progress" && field !== "statusDoc" && field !== "printStatus") {
      return NextResponse.json({ error: "Unknown field." }, { status: 400 });
    }

    const result = await updateDocumentField(controlNo, field, value);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not update." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to update document." }, { status: 500 });
  }
}

// Mark a document as printed (also sets progress = Done on the backend).
export async function POST(request: Request) {
  if (!(await requireSession())) return unauthorized();
  if (!isBackendConnected()) return notConnected();

  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    if (!controlNo) {
      return NextResponse.json({ error: "A control number is required." }, { status: 400 });
    }

    const result = await markAsPrinted(controlNo);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not update." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to mark as printed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireSession())) return unauthorized();
  if (!isBackendConnected()) return notConnected();

  try {
    const body = await request.json();
    const controlNo = String(body?.controlNo ?? "").trim();
    if (!controlNo) {
      return NextResponse.json({ error: "A control number is required." }, { status: 400 });
    }

    const result = await deleteDocument(controlNo);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not delete." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, deletedControlNo: controlNo });
  } catch {
    return NextResponse.json({ error: "Unable to delete document." }, { status: 500 });
  }
}
