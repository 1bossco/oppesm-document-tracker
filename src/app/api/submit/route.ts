import { NextResponse } from "next/server";
import { submitDocument, type DocType } from "@/lib/documents";
import { isBackendConnected } from "@/lib/sheet";
import { getStaff } from "@/lib/staff";
import { EMAIL_PATTERN, isEmailTitle } from "@/lib/email-types";

// Public endpoint — anyone with the link can submit a document or task.
export async function POST(request: Request) {
  let body: {
    docType?: string;
    title?: string;
    description?: string;
    staff?: string[]; // staff names; emails are looked up server-side
    processingTime?: string;
    dueDate?: string;
    addToCalendar?: boolean;
    continuationOf?: string;
    emailFrom?: string;
    emailSubject?: string;
    emailLink?: string;
    files?: { name: string; type: string; data: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const docType: DocType =
    body.docType === "Incoming Docs"
      ? "Incoming Docs"
      : body.docType === "New Task"
      ? "New Task"
      : "Outgoing Docs";
  const isTask = docType === "New Task";
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const dueDate = String(body.dueDate ?? "").trim();
  // Earlier control no. / tracking no. this paper continues (IN/OUT only).
  const continuationOf = isTask ? "" : String(body.continuationOf ?? "").trim().toUpperCase();
  const files = Array.isArray(body.files) ? body.files : [];
  // Incoming "Email": the Gmail conversation is found by sender (or link).
  const isEmail = docType === "Incoming Docs" && isEmailTitle(title);
  const emailFrom = isEmail ? String(body.emailFrom ?? "").trim() : "";
  const emailSubject = isEmail ? String(body.emailSubject ?? "").trim() : "";
  const emailLink = isEmail ? String(body.emailLink ?? "").trim() : "";
  // Only names that exist in the Staff Directory are accepted.
  const requested = new Set(
    (Array.isArray(body.staff) ? body.staff : []).map((n) => String(n ?? "").trim()).filter(Boolean)
  );
  const staffList = (await getStaff()).filter((s) => requested.has(s.name));
  const staffNames = staffList.map((s) => s.name).join(", ");
  const staffEmails = staffList.map((s) => s.email).filter(Boolean);
  // Calendar note applies to Incoming Docs and Tasks.
  const addToCalendar =
    (docType === "Incoming Docs" || isTask) && body.addToCalendar === true;

  if (!title || !description) {
    return NextResponse.json(
      { success: false, error: "Title and description are required." },
      { status: 400 }
    );
  }
  if (isEmail && !emailFrom && !emailLink) {
    return NextResponse.json(
      { success: false, error: "Enter the sender's email address (or a Gmail link)." },
      { status: 400 }
    );
  }
  if (emailFrom && !EMAIL_PATTERN.test(emailFrom)) {
    return NextResponse.json({ success: false, error: "That sender email address isn't valid." }, { status: 400 });
  }
  // Files required for documents (the email itself counts), optional for tasks.
  if (!isTask && !isEmail && files.length === 0) {
    return NextResponse.json(
      { success: false, error: "Please attach at least one file." },
      { status: 400 }
    );
  }

  // Local preview / not connected: complete the flow with a demo control number
  // so the interface can be exercised before the backend is wired up.
  if (!isBackendConnected()) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const prefix = docType === "Incoming Docs" ? "IN" : isTask ? "TK" : "OG";
    const controlNo = `${prefix}-${yy}${mm}${dd}-DEMO`;
    return NextResponse.json({
      success: true,
      controlNo,
      demo: true,
      notified: staffEmails.length,
      calendar: addToCalendar,
      trackingNo: continuationOf ? "TR-DEMO" : "",
      emailLinked: isEmail,
    });
  }

  const result = await submitDocument({
    docType,
    title,
    description,
    staff: staffNames,
    staffEmails,
    addToCalendar,
    processingTime: String(body.processingTime ?? "").trim(),
    dueDate,
    continuationOf,
    emailFrom,
    emailSubject,
    emailLink,
    files,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Could not submit." },
      { status: 502 }
    );
  }

  const data = result.data as { controlNo?: string; trackingNo?: string; emailLinked?: boolean } | undefined;
  return NextResponse.json({
    success: true,
    controlNo: data?.controlNo ?? "",
    trackingNo: data?.trackingNo ?? "",
    emailLinked: data?.emailLinked === true,
  });
}
