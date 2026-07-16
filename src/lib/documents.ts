import { backendGet, backendPost } from "@/lib/sheet";

export type DocType = "Incoming Docs" | "Outgoing Docs" | "New Task";
export type Progress = "In Progress" | "Done" | "Cancelled";
export type StatusDoc = "In Progress" | "Follow-up" | "Done" | "Cancelled";
export type PrintStatus = "" | "For Printing" | "Printed";

export interface TrackedDocument {
  timestamp: string;
  controlNo: string;
  docType: DocType;
  title: string;
  description: string;
  fileUrl: string;
  staff: string;
  processingTime: string;
  /** Explicit due date for tasks (yyyy-MM-dd). Empty for documents. */
  dueDate: string;
  statusDoc: string;
  progress: string;
  printStatus: string;
}

/** Raw row shape returned by the Apps Script backend (all strings). */
interface DocumentRow {
  timestamp?: string;
  controlNo?: string;
  docType?: string;
  title?: string;
  description?: string;
  fileUrl?: string;
  staff?: string;
  processingTime?: string;
  dueDate?: string;
  statusDoc?: string;
  progress?: string;
  printStatus?: string;
}

function normalizeDocType(v: string): DocType {
  if (v === "Incoming Docs") return "Incoming Docs";
  if (v === "New Task") return "New Task";
  return "Outgoing Docs";
}

function rowToDocument(row: DocumentRow): TrackedDocument | null {
  const controlNo = String(row.controlNo ?? "").trim();
  if (!controlNo) return null;

  return {
    timestamp: String(row.timestamp ?? "").trim(),
    controlNo,
    docType: normalizeDocType(String(row.docType ?? "").trim()),
    title: String(row.title ?? "").trim(),
    description: String(row.description ?? "").trim(),
    fileUrl: String(row.fileUrl ?? "").trim(),
    staff: String(row.staff ?? "").trim(),
    processingTime: String(row.processingTime ?? "").trim(),
    dueDate: String(row.dueDate ?? "").trim(),
    statusDoc: String(row.statusDoc ?? "").trim(),
    progress: String(row.progress ?? "").trim(),
    printStatus: String(row.printStatus ?? "").trim(),
  };
}

// ── Sample data — shown for local preview before the backend is connected. ──
// Built relative to "today" so the deadline colors (On track / Follow-up /
// Exceeded / Overdue / Done) all appear in the demo regardless of the date.
function offsetDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}
function sampleTimestamp(daysAgo: number, hhmm: string): string {
  const d = offsetDate(daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd} ${hhmm}`;
}
function sampleControlNo(prefix: string, daysAgo: number, seq: number): string {
  const d = offsetDate(daysAgo);
  const yy = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}-${yy}${m}${dd}-${String(seq).padStart(3, "0")}`;
}

// A due date N days from today (yyyy-MM-dd), for sample tasks.
function sampleDueDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// The two sample task control numbers (so chat/MOV demo data can match them).
export function sampleTaskControlNos(): { onTrack: string; overdue: string } {
  return { onTrack: sampleControlNo("TK", 1, 1), overdue: sampleControlNo("TK", 4, 1) };
}

export function buildSampleDocuments(): TrackedDocument[] {
  return [
    // On track — submitted today, 3-day window.
    {
      timestamp: sampleTimestamp(0, "09:12"), controlNo: sampleControlNo("IN", 0, 1),
      docType: "Incoming Docs", title: "Request for Job Fair Assistance",
      description: "LGU request for OPPESM support at the municipal job fair, including manpower and booth assistance for the two-day event scheduled at the provincial capitol grounds.",
      fileUrl: "#", staff: "Maria Santos", processingTime: "3 days", dueDate: "",
      statusDoc: "In Progress", progress: "In Progress", printStatus: "",
    },
    // Follow-up (yellow) — 3 days into a 6-day window (half reached).
    {
      timestamp: sampleTimestamp(3, "10:40"), controlNo: sampleControlNo("IN", 3, 1),
      docType: "Incoming Docs", title: "Complaint Referral",
      description: "Referral from the Provincial Legal Office regarding a labor-related concern that requires coordination with the mediation team and a written reply to the complainant.",
      fileUrl: "#", staff: "Maria Santos", processingTime: "6 days", dueDate: "",
      statusDoc: "In Progress", progress: "In Progress", printStatus: "",
    },
    // Exceeded (orange) — 5 days into an 8-day window (past half + 1 day).
    {
      timestamp: sampleTimestamp(5, "14:05"), controlNo: sampleControlNo("OG", 5, 1),
      docType: "Outgoing Docs", title: "Endorsement Letter to DOLE",
      description: "Endorsement of qualified applicants for the Special Program for Employment of Students (SPES) for the current cycle, for transmittal to the DOLE regional office.",
      fileUrl: "#", staff: "Jose Cruz", processingTime: "8 days", dueDate: "",
      statusDoc: "In Progress", progress: "In Progress", printStatus: "For Printing",
    },
    // Overdue (red) — 7 days into a 5-day window (past deadline).
    {
      timestamp: sampleTimestamp(7, "08:30"), controlNo: sampleControlNo("OG", 7, 1),
      docType: "Outgoing Docs", title: "Notice of Meeting",
      description: "Notice for the quarterly Provincial Employment coordination meeting to be circulated to all municipal PESO managers across the province.",
      fileUrl: "#", staff: "Ana Reyes", processingTime: "5 days", dueDate: "",
      statusDoc: "In Progress", progress: "In Progress", printStatus: "For Printing",
    },
    // Done (green) — completed regardless of the clock.
    {
      timestamp: sampleTimestamp(2, "16:48"), controlNo: sampleControlNo("OG", 2, 2),
      docType: "Outgoing Docs", title: "Memorandum on PESO Activities",
      description: "Monthly memorandum on OPPESM activities and accomplishments circulated to municipal PESO managers.",
      fileUrl: "#", staff: "Ana Reyes", processingTime: "2 days", dueDate: "",
      statusDoc: "Done", progress: "Done", printStatus: "Printed",
    },
    // Sample task — due in 6 days (on track), calendar-worthy.
    {
      timestamp: sampleTimestamp(1, "08:15"), controlNo: sampleControlNo("TK", 1, 1),
      docType: "New Task", title: "Prepare Q3 employment report",
      description: "Compile the provincial employment facilitation figures for the third quarter and prepare the summary deck for the Manager.",
      fileUrl: "#", staff: "Ana Reyes", processingTime: "", dueDate: sampleDueDate(6),
      statusDoc: "In Progress", progress: "In Progress", printStatus: "",
    },
    // Sample task — due yesterday (overdue).
    {
      timestamp: sampleTimestamp(4, "13:20"), controlNo: sampleControlNo("TK", 4, 1),
      docType: "New Task", title: "Follow up SPES payroll",
      description: "Coordinate with Finance on the release of SPES stipends and confirm the payroll schedule with the beneficiaries.",
      fileUrl: "#", staff: "Jose Cruz", processingTime: "", dueDate: sampleDueDate(-1),
      statusDoc: "Follow-up", progress: "In Progress", printStatus: "",
    },
  ];
}

/** All documents, newest first. Falls back to sample data when not connected. */
export async function getDocuments(): Promise<TrackedDocument[]> {
  const rows = await backendGet<DocumentRow[]>("documents");
  if (!rows) return buildSampleDocuments();

  const docs = rows
    .map(rowToDocument)
    .filter((d): d is TrackedDocument => d !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return docs;
}

export interface DashboardStats {
  total: number;
  incoming: number;
  outgoing: number;
  done: number;
  inProgress: number;
  cancelled: number;
  forPrinting: number;
  printed: number;
  followUp: number;
  monthly: number[];
}

export function computeStats(docs: TrackedDocument[]): DashboardStats {
  const monthly = new Array(12).fill(0);
  docs.forEach((d) => {
    const mo = parseInt(d.timestamp.substring(5, 7), 10) - 1;
    if (mo >= 0 && mo <= 11) monthly[mo] += 1;
  });

  return {
    total: docs.length,
    incoming: docs.filter((d) => d.docType === "Incoming Docs").length,
    outgoing: docs.filter((d) => d.docType === "Outgoing Docs").length,
    done: docs.filter((d) => d.progress === "Done").length,
    inProgress: docs.filter((d) => d.progress === "In Progress").length,
    cancelled: docs.filter((d) => d.progress === "Cancelled").length,
    forPrinting: docs.filter((d) => d.printStatus === "For Printing").length,
    printed: docs.filter((d) => d.printStatus === "Printed").length,
    followUp: docs.filter((d) => d.statusDoc === "Follow-up").length,
    monthly,
  };
}

export interface SubmitPayload {
  docType: DocType;
  title: string;
  description: string;
  staff: string; // joined names, stored in the sheet's staff column
  staffEmails: string[]; // for notification emails / calendar guests
  addToCalendar: boolean; // Incoming Docs and Tasks
  processingTime: string;
  dueDate: string; // Tasks only (yyyy-MM-dd)
  files: { name: string; type: string; data: string }[];
}

export async function submitDocument(payload: SubmitPayload) {
  return backendPost({ action: "submit", ...payload });
}

export async function updateDocumentField(
  controlNo: string,
  field: "progress" | "statusDoc" | "printStatus",
  value: string
) {
  return backendPost({ action: "updateStatus", controlNo, field, value });
}

export async function markAsPrinted(controlNo: string) {
  return backendPost({ action: "markPrinted", controlNo });
}

export async function deleteDocument(controlNo: string) {
  return backendPost({ action: "delete", controlNo });
}
