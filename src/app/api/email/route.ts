import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_NAME_COOKIE, SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { getEmailCandidates, getEmailThread, linkEmail, sendEmailReply } from "@/lib/email";
import { EMAIL_PATTERN, signatureFor } from "@/lib/email-types";
import { isBackendConnected } from "@/lib/sheet";
import { getStaff } from "@/lib/staff";

async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(token);
}

// Signed-in admin's name (Audit Trail + reply signature).
async function adminName() {
  return (await cookies()).get(ADMIN_NAME_COOKIE)?.value || "Admin";
}

const unauthorized = () => NextResponse.json({ error: "Not signed in." }, { status: 401 });
const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

// ?controlNo=… → linked conversation · ?from=… → recent conversations from a sender
export async function GET(request: Request) {
  if (!(await requireSession())) return unauthorized();
  const params = new URL(request.url).searchParams;
  const from = (params.get("from") ?? "").trim();
  if (from) {
    if (!EMAIL_PATTERN.test(from)) return badRequest("Enter a valid email address.");
    return NextResponse.json(await getEmailCandidates(from));
  }
  const controlNo = (params.get("controlNo") ?? "").trim();
  if (!controlNo) return badRequest("A control number is required.");
  return NextResponse.json(await getEmailThread(controlNo));
}

// { action: "link", controlNo, threadId } · { action: "reply", controlNo, body, replyAll, files }
export async function POST(request: Request) {
  if (!(await requireSession())) return unauthorized();

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const controlNo = String(body?.controlNo ?? "").trim();
    if (!controlNo) return badRequest("A control number is required.");
    const user = await adminName();

    if (action === "link") {
      const threadId = String(body?.threadId ?? "").trim();
      if (!threadId) return badRequest("Pick an email conversation.");
      if (!isBackendConnected()) return NextResponse.json({ ok: true, demo: true });
      const result = await linkEmail(controlNo, threadId, user);
      if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not link." }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    if (action === "reply") {
      const text = String(body?.body ?? "").trim();
      if (!text) return badRequest("Write a message first.");
      const files = Array.isArray(body?.files) ? body.files : [];
      // Signature comes from the Staff Directory, not the browser.
      const member = (await getStaff()).find((s) => s.name === user);
      const signature = signatureFor(user, member?.position ?? "");

      if (!isBackendConnected()) {
        return NextResponse.json({ ok: true, demo: true, signature, controlNo: "OG-DEMO", trackingNo: "TR-DEMO" });
      }
      const result = await sendEmailReply({ controlNo, body: text, replyAll: body?.replyAll === true, signature, files, user });
      if (!result.ok) return NextResponse.json({ error: result.error ?? "Could not send." }, { status: 502 });
      const data = result.data as { controlNo?: string; trackingNo?: string; warning?: string } | undefined;
      return NextResponse.json({ ok: true, signature, controlNo: data?.controlNo ?? "", trackingNo: data?.trackingNo ?? "", warning: data?.warning });
    }

    return badRequest("Unknown action.");
  } catch {
    return NextResponse.json({ error: "Unable to process the email request." }, { status: 500 });
  }
}
