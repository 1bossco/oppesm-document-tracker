import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_NAME_COOKIE, SESSION_COOKIE, isValidSession } from "@/lib/auth";
import {
  addProcessNote,
  getProcessData,
  linkDocument,
  setProcessStatus,
  unlinkDocument,
} from "@/lib/processes";
import { isBackendConnected } from "@/lib/sheet";

async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(token);
}

// Signed-in admin's name for the Audit Trail.
async function adminName() {
  return (await cookies()).get(ADMIN_NAME_COOKIE)?.value || "Admin";
}

const unauthorized = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });
const notConnected = () =>
  NextResponse.json({ error: "The spreadsheet backend is not connected." }, { status: 503 });
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET() {
  if (!(await requireSession())) return unauthorized();
  return NextResponse.json(await getProcessData());
}

// One endpoint for all process actions: link · unlink · note · status.
export async function POST(request: Request) {
  if (!(await requireSession())) return unauthorized();
  if (!isBackendConnected()) return notConnected();

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const user = await adminName();
    const str = (v: unknown) => String(v ?? "").trim();

    let result;
    if (action === "link") {
      const controlNo = str(body.controlNo).toUpperCase();
      const ref = str(body.ref).toUpperCase();
      if (!controlNo || !ref) return badRequest("A document and a control/tracking number are required.");
      result = await linkDocument(controlNo, ref, user);
    } else if (action === "unlink") {
      const controlNo = str(body.controlNo);
      if (!controlNo) return badRequest("A control number is required.");
      result = await unlinkDocument(controlNo, user);
    } else if (action === "note") {
      const trackingNo = str(body.trackingNo);
      const office = str(body.office);
      const note = str(body.note);
      if (!trackingNo) return badRequest("A tracking number is required.");
      if (!office && !note) return badRequest("Enter an office or a note.");
      result = await addProcessNote(trackingNo, office, note, user);
    } else if (action === "status") {
      const trackingNo = str(body.trackingNo);
      const status = str(body.status);
      if (!trackingNo) return badRequest("A tracking number is required.");
      if (status !== "Open" && status !== "Completed" && status !== "Cancelled") return badRequest("Unknown status.");
      result = await setProcessStatus(trackingNo, status, user);
    } else {
      return badRequest("Unknown action.");
    }

    if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not save." }, { status: 502 });
    return NextResponse.json({ ok: true, data: result.data });
  } catch {
    return NextResponse.json({ error: "Unable to update the process." }, { status: 500 });
  }
}
