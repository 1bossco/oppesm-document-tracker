"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackedDocument, DashboardStats } from "@/lib/documents";
import type { AuditEntry } from "@/lib/audit";
import type { PrintData } from "@/lib/printing";
import type { PublicStaff } from "@/lib/staff";
import { TaskThread } from "@/components/TaskThread";
import { ProcessPanel } from "@/components/ProcessPanel";
import {
  buildTimeline,
  eventTime,
  formatShortDate,
  formatSpan,
  shouldAutoComplete,
  type Process,
  type ProcessData,
  type ProcessStatus,
  type TimelineEvent,
} from "@/lib/timeline";

type View = "dashboard" | "documents" | "processes" | "printing" | "audit";
type ProcessFilter = "open" | "completed" | "cancelled" | "all";

const DAY = 86400000;

interface ProcessRow {
  p: Process;
  events: TimelineEvent[];
  docCount: number;
  first: number;
  last: TimelineEvent | undefined;
  days: number;
}

function stageText(row: ProcessRow): string {
  const last = row.last;
  if (row.p.status !== "Open") return row.p.status;
  if (!last) return "—";
  const ago = formatSpan(Date.now() - last.time) + " ago";
  if (last.kind !== "NOTE") return last.kind === "OUT" ? `Sent out · ${ago}` : `Received at OPPESM · ${ago}`;
  const label = [last.note.office, last.note.note].filter(Boolean).join(": ");
  return `${label || "Note"} · ${ago}`;
}

function chipLabel(ev: TimelineEvent): string {
  const kind = ev.kind === "NOTE" ? ev.note.office || "Note" : ev.kind;
  return `${kind} ${formatShortDate(ev.time)}`;
}

interface ProcessApiResult {
  ok: boolean;
  error?: string;
  data?: { trackingNo?: string; id?: string; createdAt?: string };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Deadline color formula (calendar days, computed live) ───────────────────
//   before half of processing time → On track (blue)
//   half elapsed                   → Follow-up (yellow)
//   1 day after the half point     → Exceeded (orange)
//   on/after the deadline          → Overdue (red)
//   marked Done                    → Done (green, overrides all)
type DeadlineKey = "green" | "red" | "orange" | "yellow" | "ontrack" | "cancelled" | "none";
interface DeadlineInfo { key: DeadlineKey; label: string; badge: string; note: string; }

function parseProcessingDays(pt: string): number | null {
  const m = String(pt).match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isFinite(n) && n > 0 ? n : null;
}
function parseSubmitDate(ts: string): Date | null {
  const m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}
function deadlineInfo(d: TrackedDocument): DeadlineInfo {
  if (d.progress === "Done" || d.printStatus === "Printed")
    return { key: "green", label: "Done", badge: "badge-green", note: "Completed" };
  if (d.progress === "Cancelled")
    return { key: "cancelled", label: "Cancelled", badge: "badge-gray", note: "Cancelled" };

  const submit = parseSubmitDate(d.timestamp);
  if (!submit) return { key: "none", label: "—", badge: "badge-gray", note: "No date" };

  // Tasks carry an explicit due date; documents derive it from processing days.
  let due: Date;
  let P: number;
  if (d.dueDate) {
    const dd = parseSubmitDate(d.dueDate);
    if (!dd) return { key: "none", label: "—", badge: "badge-gray", note: "No due date set" };
    due = dd;
    P = Math.round((due.getTime() - submit.getTime()) / 86400000);
  } else {
    const pd = parseProcessingDays(d.processingTime);
    if (pd === null) return { key: "none", label: "—", badge: "badge-gray", note: "No processing time set" };
    P = pd;
    due = new Date(submit);
    due.setDate(due.getDate() + Math.ceil(P));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.floor((today.getTime() - submit.getTime()) / 86400000);
  const remaining = Math.round((due.getTime() - today.getTime()) / 86400000);
  const half = P / 2;

  let key: DeadlineKey, label: string, badge: string;
  if (elapsed >= P) { key = "red"; label = "Overdue"; badge = "badge-red"; }
  else if (elapsed >= half + 1) { key = "orange"; label = "Exceeded"; badge = "badge-orange"; }
  else if (elapsed >= half) { key = "yellow"; label = "Follow-up"; badge = "badge-yellow"; }
  else { key = "ontrack"; label = "On track"; badge = "badge-blue"; }

  const note =
    elapsed >= P
      ? `Due ${fmtDate(due)} · ${Math.abs(remaining)} day(s) overdue`
      : `Due ${fmtDate(due)} · ${remaining} day(s) left`;
  return { key, label, badge, note };
}
function needsFollowUp(d: TrackedDocument): boolean {
  const k = deadlineInfo(d).key;
  return k === "yellow" || k === "orange" || k === "red";
}

function computeStats(all: TrackedDocument[]): DashboardStats {
  // The dashboard is document-centric; tasks are tracked separately.
  const docs = all.filter((d) => d.docType !== "New Task");
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
    followUp: docs.filter((d) => needsFollowUp(d)).length,
    monthly,
  };
}

function printBadge(v: string) {
  if (v === "Printed") return "badge-green";
  if (v === "For Printing") return "badge-purple";
  return "badge-gray";
}

export function AdminDashboard({
  initialDocs,
  initialStats,
  initialAudit,
  initialPrintData,
  initialProcesses,
  staff,
  adminName,
  connected,
}: {
  initialDocs: TrackedDocument[];
  initialStats: DashboardStats;
  initialAudit: AuditEntry[];
  initialPrintData: PrintData;
  initialProcesses: ProcessData;
  staff: PublicStaff[];
  adminName: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("dashboard");
  const [docs, setDocs] = useState<TrackedDocument[]>(initialDocs);
  const [processData, setProcessData] = useState<ProcessData>(initialProcesses);
  // When the server re-renders (↻ Refresh / router.refresh), take its fresh data.
  const [syncedFrom, setSyncedFrom] = useState({ initialDocs, initialProcesses });
  if (syncedFrom.initialDocs !== initialDocs || syncedFrom.initialProcesses !== initialProcesses) {
    setSyncedFrom({ initialDocs, initialProcesses });
    setDocs(initialDocs);
    setProcessData(initialProcesses);
  }
  const audit = initialAudit;
  const printData = initialPrintData;
  const [openProcess, setOpenProcess] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("open");
  const [processSearch, setProcessSearch] = useState("");
  const [search, setSearch] = useState("");
  const [docScope, setDocScope] = useState<"all" | "incoming" | "outgoing" | "followup" | "task">("all");
  const [progressFilter, setProgressFilter] = useState("");
  const [toast, setToast] = useState<{ title: string; body: string; error?: boolean } | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [paperSize, setPaperSize] = useState<"long" | "a4" | "short">("long");
  const [threadFor, setThreadFor] = useState<{ controlNo: string; title: string; tab: "chat" | "mov" } | null>(null);

  const stats = useMemo(() => computeStats(docs), [docs]);
  const taskCount = useMemo(() => docs.filter((d) => d.docType === "New Task").length, [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      const isTaskRow = d.docType === "New Task";
      // The Tasks view shows only tasks; the document views exclude tasks.
      if (docScope === "task") {
        if (!isTaskRow) return false;
      } else if (isTaskRow) {
        return false;
      }
      if (docScope === "incoming" && d.docType !== "Incoming Docs") return false;
      if (docScope === "outgoing" && d.docType !== "Outgoing Docs") return false;
      if (docScope === "followup" && !needsFollowUp(d)) return false;
      if (progressFilter && d.progress !== progressFilter) return false;
      if (!q) return true;
      return (
        d.controlNo.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.staff.toLowerCase().includes(q) ||
        d.trackingNo.toLowerCase().includes(q)
      );
    });
  }, [docs, search, docScope, progressFilter]);

  function openDocs(scope: "all" | "incoming" | "outgoing" | "followup" | "task") {
    setDocScope(scope);
    setView("documents");
  }

  // ── Tracked processes ─────────────────────────────────────────────────────
  const processRows = useMemo<ProcessRow[]>(() => {
    const now = Date.now();
    return processData.processes
      .map((p) => {
        const pdocs = docs.filter((d) => d.trackingNo === p.trackingNo);
        const events = buildTimeline(pdocs, processData.notes.filter((n) => n.trackingNo === p.trackingNo));
        const first = events[0]?.time || eventTime(p.createdAt);
        const last = events[events.length - 1];
        const end = p.status === "Open" ? now : eventTime(p.closedAt) || last?.time || now;
        return { p, events, docCount: pdocs.length, first, last, days: Math.max(0, Math.floor((end - first) / DAY)) };
      })
      .filter((r) => r.docCount > 0) // every linked document deleted/unlinked → hide
      .sort((a, b) => (b.last?.time || 0) - (a.last?.time || 0));
  }, [processData, docs]);

  const openProcessCount = useMemo(() => processRows.filter((r) => r.p.status === "Open").length, [processRows]);

  const filteredProcesses = useMemo(() => {
    const q = processSearch.trim().toLowerCase();
    return processRows.filter((r) => {
      if (processFilter === "open" && r.p.status !== "Open") return false;
      if (processFilter === "completed" && r.p.status !== "Completed") return false;
      if (processFilter === "cancelled" && r.p.status !== "Cancelled") return false;
      if (!q) return true;
      return (
        r.p.trackingNo.toLowerCase().includes(q) ||
        r.p.subject.toLowerCase().includes(q) ||
        r.events.some((e) =>
          e.kind === "NOTE"
            ? `${e.note.office} ${e.note.note}`.toLowerCase().includes(q)
            : `${e.doc.controlNo} ${e.doc.title}`.toLowerCase().includes(q)
        )
      );
    });
  }, [processRows, processFilter, processSearch]);

  const officeSuggestions = useMemo(
    () => Array.from(new Set(processData.notes.map((n) => n.office).filter(Boolean))).sort(),
    [processData.notes]
  );

  async function postProcess(body: Record<string, unknown>): Promise<ProcessApiResult> {
    try {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error || "Could not save." };
    } catch {
      return { ok: false, error: "Could not reach the server." };
    }
  }

  // Mirrors the backend's auto-complete rule after a document is marked Done.
  function autoCompleteLocal(nextDocs: TrackedDocument[], controlNo: string) {
    const doc = nextDocs.find((d) => d.controlNo === controlNo);
    if (!doc?.trackingNo) return;
    const proc = processData.processes.find((p) => p.trackingNo === doc.trackingNo);
    if (!proc || proc.status !== "Open") return;
    if (!shouldAutoComplete(nextDocs.filter((d) => d.trackingNo === doc.trackingNo))) return;
    setProcessData((pd) => ({
      ...pd,
      processes: pd.processes.map((p) =>
        p.trackingNo === doc.trackingNo ? { ...p, status: "Completed", closedAt: new Date().toISOString() } : p
      ),
    }));
    flash("Process completed", `${doc.trackingNo} was completed automatically.`);
  }

  // Link `controlNo` into the process of `refRaw` (a control no. or tracking no.).
  async function linkDoc(controlNo: string, refRaw: string) {
    const ref = refRaw.trim().toUpperCase();
    if (!ref) return;
    const mov = docs.find((d) => d.controlNo.toUpperCase() === controlNo.toUpperCase());
    if (!mov || mov.docType === "New Task") { flash("Error", "Only Incoming/Outgoing documents can be linked.", true); return; }
    if (ref === mov.controlNo.toUpperCase()) { flash("Error", "A document can't be linked to itself.", true); return; }

    let trackingNo: string;
    let refControl = "";
    let created: Process | null = null;
    if (ref.startsWith("TR-")) {
      const proc = processData.processes.find((p) => p.trackingNo.toUpperCase() === ref);
      if (!proc) { flash("Error", `Tracking number not found: ${ref}`, true); return; }
      trackingNo = proc.trackingNo;
    } else {
      const prev = docs.find((d) => d.controlNo.toUpperCase() === ref && d.docType !== "New Task");
      if (!prev) { flash("Error", `Control number not found: ${ref}`, true); return; }
      refControl = prev.controlNo;
      trackingNo = prev.trackingNo || mov.trackingNo;
      if (!trackingNo) {
        // Placeholder until the backend assigns the real number.
        trackingNo = `TR-NEW-${Date.now().toString().slice(-4)}`;
        created = { trackingNo, subject: prev.title, status: "Open", createdAt: new Date().toISOString(), closedAt: "", createdBy: adminName };
      }
    }

    const tn = trackingNo;
    setDocs((prev) => prev.map((d) =>
      d.controlNo === mov.controlNo || (d.controlNo === refControl && !d.trackingNo) ? { ...d, trackingNo: tn } : d
    ));
    setProcessData((pd) => ({
      ...pd,
      processes: [
        ...(created ? [created] : []),
        ...pd.processes.map((p) => (p.trackingNo === tn && p.status !== "Open" ? { ...p, status: "Open" as const, closedAt: "" } : p)),
      ],
    }));
    setOpenProcess(tn);

    if (!connected) { flash("Demo mode", `Linked to ${tn} locally, not saved.`); return; }
    const res = await postProcess({ action: "link", controlNo: mov.controlNo, ref });
    if (!res.ok) { flash("Error", res.error || "Could not link.", true); router.refresh(); return; }
    const real = res.data?.trackingNo || tn;
    if (real !== tn) {
      setDocs((prev) => prev.map((d) => (d.trackingNo === tn ? { ...d, trackingNo: real } : d)));
      setProcessData((pd) => ({ ...pd, processes: pd.processes.map((p) => (p.trackingNo === tn ? { ...p, trackingNo: real } : p)) }));
      setOpenProcess(real);
    }
    flash("Linked", `${mov.controlNo} → ${real}`);
    router.refresh();
  }

  function promptLink(controlNo: string) {
    const ref = window.prompt(
      `Link ${controlNo} to which document?\n\nEnter the earlier control no. (e.g. OG-261001-003) or a tracking no. (TR-…).`
    );
    if (ref) linkDoc(controlNo, ref);
  }

  async function unlinkDoc(controlNo: string) {
    if (!window.confirm(`Remove ${controlNo} from this process? The document itself is kept.`)) return;
    setDocs((prev) => prev.map((d) => (d.controlNo === controlNo ? { ...d, trackingNo: "" } : d)));
    if (!connected) { flash("Demo mode", "Removed locally, not saved."); return; }
    const res = await postProcess({ action: "unlink", controlNo });
    if (!res.ok) { flash("Error", res.error || "Could not remove.", true); router.refresh(); }
  }

  async function addNote(trackingNo: string, office: string, note: string): Promise<boolean> {
    const localId = `local-${Date.now()}`;
    setProcessData((pd) => ({
      ...pd,
      notes: [...pd.notes, { id: localId, trackingNo, office, note, by: adminName, createdAt: new Date().toISOString() }],
    }));
    if (!connected) { flash("Demo mode", "Step added locally, not saved."); return true; }
    const res = await postProcess({ action: "note", trackingNo, office, note });
    if (!res.ok) {
      setProcessData((pd) => ({ ...pd, notes: pd.notes.filter((n) => n.id !== localId) }));
      flash("Error", res.error || "Could not add the step.", true);
      return false;
    }
    return true;
  }

  async function setStatus(trackingNo: string, status: ProcessStatus) {
    if (status === "Cancelled" && !window.confirm(`Cancel process ${trackingNo}? You can reopen it later.`)) return;
    setProcessData((pd) => ({
      ...pd,
      processes: pd.processes.map((p) =>
        p.trackingNo === trackingNo ? { ...p, status, closedAt: status === "Open" ? "" : new Date().toISOString() } : p
      ),
    }));
    if (!connected) { flash("Demo mode", `Marked ${status.toLowerCase()} locally, not saved.`); return; }
    const res = await postProcess({ action: "status", trackingNo, status });
    if (!res.ok) { flash("Error", res.error || "Could not update.", true); router.refresh(); }
  }

  // Outgoing docs still waiting to be printed → the queue + the receiving sheet.
  const printQueue = useMemo(() => docs.filter((d) => d.printStatus === "For Printing"), [docs]);
  const receiversByControl = useMemo(() => {
    const m: Record<string, string[]> = {};
    printData.rows.forEach((r) => { m[r.controlNo] = r.receivers; });
    return m;
  }, [printData]);
  // Number of "Received by" columns on the sheet (min 4, like the paper form).
  const printCols = useMemo(() => {
    let max = 0;
    printQueue.forEach((d) => {
      const n = (receiversByControl[d.controlNo] || []).length;
      if (n > max) max = n;
    });
    return Math.max(4, max);
  }, [printQueue, receiversByControl]);

  const PAPER: Record<string, string> = { long: "13in 8.5in", a4: "297mm 210mm", short: "11in 8.5in" };

  function flash(title: string, body: string, error?: boolean) {
    setToast({ title, body, error });
    setTimeout(() => setToast(null), 3500);
  }

  async function callApi(method: string, body: Record<string, unknown>) {
    const res = await fetch("/api/documents", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function updateField(controlNo: string, field: "progress" | "statusDoc" | "printStatus", value: string) {
    // Optimistic local update so the UI stays responsive (and works in demo mode).
    const nextDocs = docs.map((d) => (d.controlNo === controlNo ? { ...d, [field]: value } : d));
    setDocs(nextDocs);
    if (field === "progress" && value === "Done") autoCompleteLocal(nextDocs, controlNo);
    if (!connected) { flash("Demo mode", "Change shown locally, not saved."); return; }
    const res = await callApi("PATCH", { controlNo, field, value });
    if (!res.ok) flash("Error", "Could not save the change.", true);
  }

  async function markPrinted(controlNo: string) {
    const nextDocs = docs.map((d) => (d.controlNo === controlNo ? { ...d, printStatus: "Printed", progress: "Done", statusDoc: "Done" } : d));
    setDocs(nextDocs);
    autoCompleteLocal(nextDocs, controlNo);
    if (!connected) { flash("Demo mode", "Marked printed locally, not saved."); return; }
    const res = await callApi("POST", { controlNo });
    if (!res.ok) flash("Error", "Could not mark as printed.", true);
  }

  async function removeDoc(controlNo: string) {
    if (!window.confirm(`Delete ${controlNo}? This cannot be undone.`)) return;
    setDocs((prev) => prev.filter((d) => d.controlNo !== controlNo));
    if (!connected) { flash("Demo mode", "Deleted locally, not saved."); return; }
    const res = await callApi("DELETE", { controlNo });
    if (!res.ok) flash("Error", "Could not delete.", true);
  }

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  const maxMonthly = Math.max(1, ...stats.monthly);

  return (
    <div className="admin-scope">
      <style>{ADMIN_CSS}</style>
      <div className="app-shell">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sb-brand">
            <span className="lbl">OPPESM</span>
            <h3>Document Tracker</h3>
            <p>Admin Dashboard</p>
          </div>
          <nav className="sb-nav">
            <div className="nav-sec">Overview</div>
            <button className={"nav-item" + (view === "dashboard" ? " active" : "")} onClick={() => setView("dashboard")}>
              <span className="ico">📊</span> Dashboard
            </button>
            <div className="nav-sec">Documents</div>
            <button className={"nav-item" + (view === "documents" && docScope === "all" ? " active" : "")} onClick={() => openDocs("all")}>
              <span className="ico">📁</span> All Documents
              <span className="nbadge yellow show">{stats.total}</span>
            </button>
            <button className={"nav-item" + (view === "documents" && docScope === "incoming" ? " active" : "")} onClick={() => openDocs("incoming")}>
              <span className="ico">↘</span> Incoming
              {stats.incoming > 0 && <span className="nbadge blue show">{stats.incoming}</span>}
            </button>
            <button className={"nav-item" + (view === "documents" && docScope === "outgoing" ? " active" : "")} onClick={() => openDocs("outgoing")}>
              <span className="ico">↗</span> Outgoing
              {stats.outgoing > 0 && <span className="nbadge blue show">{stats.outgoing}</span>}
            </button>
            <button className={"nav-item" + (view === "documents" && docScope === "followup" ? " active" : "")} onClick={() => openDocs("followup")}>
              <span className="ico">🚩</span> Follow-up
              {stats.followUp > 0 && <span className="nbadge orange show">{stats.followUp}</span>}
            </button>
            <button className={"nav-item" + (view === "processes" ? " active" : "")} onClick={() => setView("processes")}>
              <span className="ico">🔗</span> Processes
              {openProcessCount > 0 && <span className="nbadge purple show">{openProcessCount}</span>}
            </button>
            <button className={"nav-item" + (view === "documents" && docScope === "task" ? " active" : "")} onClick={() => openDocs("task")}>
              <span className="ico">✅</span> Tasks
              {taskCount > 0 && <span className="nbadge blue show">{taskCount}</span>}
            </button>
            <div className="nav-sec">Actions</div>
            <button className={"nav-item" + (view === "printing" ? " active" : "")} onClick={() => setView("printing")}>
              <span className="ico">🖨️</span> For Printing
              {stats.forPrinting > 0 && <span className="nbadge orange show">{stats.forPrinting}</span>}
            </button>
            <button className={"nav-item" + (view === "audit" ? " active" : "")} onClick={() => setView("audit")}>
              <span className="ico">📜</span> Audit Trail
            </button>
          </nav>
          <div className="sb-foot">
            <div className="sb-user">Signed in as <b>{adminName}</b></div>
            <button className="back-btn" onClick={signOut}>⟵ Sign out</button>
          </div>
        </aside>

        {/* Main */}
        <div className="main">
          <div className="topbar">
            <div>
              <h1>
                {view === "dashboard" && "Dashboard Overview"}
                {view === "documents" &&
                  (docScope === "incoming"
                    ? "Incoming Documents"
                    : docScope === "outgoing"
                    ? "Outgoing Documents"
                    : docScope === "followup"
                    ? "Follow-up Documents"
                    : docScope === "task"
                    ? "Tasks"
                    : "All Documents")}
                {view === "processes" && "Tracked Processes"}
                {view === "printing" && "For Printing"}
                {view === "audit" && "Audit Trail"}
              </h1>
              <div className="tsub">
                {connected ? "Live spreadsheet" : "Demo mode — spreadsheet not connected"}
              </div>
            </div>
            <div className="topbar-right">
              <button className="btn btn-outline btn-sm" onClick={() => router.refresh()}>↻ Refresh</button>
              <a className="btn btn-outline btn-sm" href="/">Submission form ↗</a>
            </div>
          </div>

          <div className="content">
            {/* DASHBOARD */}
            {view === "dashboard" && (
              <>
                <div className="stat-grid">
                  <Stat label="Total Documents" value={stats.total} sub="all records" cls="c-blue" ico="📁" />
                  <Stat label="In Progress" value={stats.inProgress} sub="being processed" cls="c-yellow" ico="⏳" />
                  <Stat label="Completed" value={stats.done} sub="marked done" cls="c-green" ico="✓" />
                  <Stat label="For Printing" value={stats.forPrinting} sub="awaiting print" cls="c-orange" ico="🖨️" />
                </div>
                <div className="stat-grid">
                  <Stat label="Incoming" value={stats.incoming} sub="received" cls="c-blue" ico="↘" />
                  <Stat label="Outgoing" value={stats.outgoing} sub="released" cls="c-blue" ico="↗" />
                  <Stat label="Follow-up" value={stats.followUp} sub="needs attention" cls="c-orange" ico="!" />
                  <Stat label="Cancelled" value={stats.cancelled} sub="cancelled" cls="c-red" ico="✕" />
                </div>

                <div className="charts-row">
                  <div className="chart-card">
                    <div className="chart-title">Documents per Month</div>
                    <div className="bar-chart">
                      {stats.monthly.map((v, i) => (
                        <div className="bar-col" key={i}>
                          <div className="bar" style={{ height: `${(v / maxMonthly) * 100}%` }} title={`${v}`} />
                          <div className="bar-lbl">{MONTHS[i]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">Status Breakdown</div>
                    <Legend color="var(--warn)" label="In Progress" value={stats.inProgress} />
                    <Legend color="var(--accent2)" label="Done" value={stats.done} />
                    <Legend color="var(--orange)" label="Follow-up" value={stats.followUp} />
                    <Legend color="var(--danger)" label="Cancelled" value={stats.cancelled} />
                    <Legend color="var(--purple)" label="For Printing" value={stats.forPrinting} />
                  </div>
                </div>

                <div className="chart-card">
                  <div className="chart-title">Recent Activity</div>
                  <div className="activity-list">
                    {audit.slice(0, 8).map((a, i) => (
                      <div className="act-item" key={i}>
                        <div className="act-dot" />
                        <div>
                          <div className="act-action">
                            {a.action} <span className="act-cn">{a.controlNo}</span>
                          </div>
                          <div className="act-meta">{a.user} · {a.timestamp}</div>
                        </div>
                      </div>
                    ))}
                    {audit.length === 0 && <div className="act-meta">No activity yet.</div>}
                  </div>
                </div>
              </>
            )}

            {/* DOCUMENTS */}
            {view === "documents" && (
              <>
                <div className="tbar">
                  <input className="sinput" placeholder="Search control no, title, description, staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="fsel" value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)}>
                    <option value="">All progress</option>
                    <option>In Progress</option>
                    <option>Done</option>
                    <option>Cancelled</option>
                  </select>
                </div>
                <div className="deadline-legend">
                  <span className="dl-title">Deadline:</span>
                  <span><i className="ld ontrack" /> On track</span>
                  <span><i className="ld yellow" /> Follow-up (½ time)</span>
                  <span><i className="ld orange" /> Exceeded (+1 day)</span>
                  <span><i className="ld red" /> Overdue (deadline)</span>
                  <span><i className="ld green" /> Done</span>
                </div>
                <div className="twrap">
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Control No</th><th>Type</th><th>Title</th><th>Description</th><th>Staff</th>
                          <th>Status</th><th>Progress</th><th>Deadline</th><th>Print</th><th>File</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((d) => {
                          const di = deadlineInfo(d);
                          return (
                          <tr key={d.controlNo}>
                            <td className="mono">
                              {d.controlNo}
                              {d.trackingNo && (
                                <button className="trk-chip" title="Open tracked process" onClick={() => setOpenProcess(d.trackingNo)}>
                                  🔗 {d.trackingNo}
                                </button>
                              )}
                            </td>
                            <td><span className={"badge " + (d.docType === "Incoming Docs" ? "badge-blue" : d.docType === "New Task" ? "badge-green" : "badge-purple")}>{d.docType === "Incoming Docs" ? "IN" : d.docType === "New Task" ? "TASK" : "OUT"}</span></td>
                            <td>{d.title}</td>
                            <td className="desc-cell" title={d.description}>
                              <span className="desc-clip">{d.description || "—"}</span>
                            </td>
                            <td>{d.staff || "—"}</td>
                            <td>
                              <select className="mini-sel" value={d.statusDoc} onChange={(e) => updateField(d.controlNo, "statusDoc", e.target.value)}>
                                <option>In Progress</option><option>Follow-up</option><option>Done</option><option>Cancelled</option>
                              </select>
                            </td>
                            <td>
                              <select className="mini-sel" value={d.progress} onChange={(e) => updateField(d.controlNo, "progress", e.target.value)}>
                                <option>In Progress</option><option>Done</option><option>Cancelled</option>
                              </select>
                            </td>
                            <td title={di.note}><span className={"badge " + di.badge}>{di.label}</span></td>
                            <td><span className={"badge " + printBadge(d.printStatus)}>{d.printStatus || "—"}</span></td>
                            <td>{d.fileUrl && d.fileUrl !== "#" ? <a className="btn btn-outline btn-xs" href={d.fileUrl} target="_blank" rel="noreferrer">View</a> : <span style={{ color: "var(--text3)" }}>—</span>}</td>
                            <td>
                              <div className="act-btns">
                                {d.docType === "New Task" && (
                                  <>
                                    <button className="btn btn-outline btn-xs" title="Task chat" onClick={() => setThreadFor({ controlNo: d.controlNo, title: d.title, tab: "chat" })}>💬</button>
                                    <button className="btn btn-outline btn-xs" title="Means of Verification" onClick={() => setThreadFor({ controlNo: d.controlNo, title: d.title, tab: "mov" })}>📎</button>
                                  </>
                                )}
                                {d.docType !== "New Task" && (
                                  <button className="btn btn-outline btn-xs" title="Link to a tracked process" onClick={() => promptLink(d.controlNo)}>🔗</button>
                                )}
                                <button className="btn btn-danger btn-xs" onClick={() => removeDoc(d.controlNo)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                        {filtered.length === 0 && (
                          <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>No documents match.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tcount">Showing {filtered.length} of {docs.length}</div>
              </>
            )}

            {/* PROCESSES */}
            {view === "processes" && (
              <>
                <div className="pr-intro">
                  One row per paper, from start to finish. Link documents with <b>Continuation of</b> on the
                  submission form, or the <b>🔗</b> button in the documents table.
                </div>
                <div className="tbar">
                  <input className="sinput" placeholder="Search tracking no, subject, control no, office…" value={processSearch} onChange={(e) => setProcessSearch(e.target.value)} />
                  <select className="fsel" value={processFilter} onChange={(e) => setProcessFilter(e.target.value as ProcessFilter)}>
                    <option value="open">Open</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <div className="twrap">
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Tracking No</th><th>Subject</th><th>Current Stage</th><th>Timeline</th><th>Days</th><th>Status</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProcesses.map((r) => (
                          <tr key={r.p.trackingNo} className="pr-row" onClick={() => setOpenProcess(r.p.trackingNo)}>
                            <td className="mono pr-tn">{r.p.trackingNo}</td>
                            <td>{r.p.subject || "—"}</td>
                            <td className="pr-stage">{stageText(r)}</td>
                            <td>
                              <div className="pr-chips">
                                {r.events.length > 6 && <span className="pr-more">+{r.events.length - 6} →</span>}
                                {r.events.slice(-6).map((e, i) => (
                                  <span key={i} className="pr-chip-wrap">
                                    {i > 0 && <span className="pr-arrow">→</span>}
                                    <span className={"pr-chip " + e.kind.toLowerCase()}>{chipLabel(e)}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="mono">{r.days}</td>
                            <td>
                              <span className={"badge " + (r.p.status === "Completed" ? "badge-green" : r.p.status === "Cancelled" ? "badge-gray" : "badge-blue")}>
                                {r.p.status}
                              </span>
                            </td>
                            <td><button className="btn btn-outline btn-xs">View</button></td>
                          </tr>
                        ))}
                        {filteredProcesses.length === 0 && (
                          <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>No tracked processes match.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="tcount">Showing {filteredProcesses.length} of {processRows.length}</div>
              </>
            )}

            {/* PRINTING */}
            {view === "printing" && (
              <>
                <div className="fp-header">
                  <div className="fp-info">
                    <h2>🖨️ For Printing Queue</h2>
                    <p>
                      Outgoing documents waiting to be printed. Click <b>Mark as Printed</b> — progress
                      and status update automatically. No extra steps needed.
                    </p>
                  </div>
                  <div className="fp-tools">
                    <span className="fp-pending">{printQueue.length} pending</span>
                    <button className="btn btn-primary btn-sm" disabled={printQueue.length === 0} onClick={() => setShowPrint(true)}>🧾 Print Sheet</button>
                    <button className="btn btn-outline btn-sm" onClick={() => router.refresh()}>↻ Refresh</button>
                  </div>
                </div>

                {printQueue.length === 0 ? (
                  <div className="fp-empty">Nothing is queued for printing right now.</div>
                ) : (
                  <div className="fp-grid">
                    {printQueue.map((d) => (
                      <div className="fp-card" key={d.controlNo}>
                        <div className="fp-cn">{d.controlNo}</div>
                        <div className="fp-title">{d.title}</div>
                        <div className="fp-desc">{d.description}</div>
                        <div className="fp-meta">
                          <span>🕓 {d.timestamp}</span>
                          {d.processingTime && <span>· ⏱ {d.processingTime} processing</span>}
                        </div>
                        <div className="fp-card-actions">
                          <button className="btn btn-success btn-sm fp-mark" onClick={() => markPrinted(d.controlNo)}>🖨️ Mark as Printed</button>
                          {d.fileUrl && d.fileUrl !== "#" ? (
                            <a className="btn btn-outline btn-sm" href={d.fileUrl} target="_blank" rel="noreferrer">📄 View</a>
                          ) : (
                            <button className="btn btn-outline btn-sm" disabled title="No file attached">📄 View</button>
                          )}
                          <button className="btn btn-warn btn-sm fp-edit" title="Edit this document" onClick={() => { setSearch(d.controlNo); openDocs("all"); }}>✏️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* AUDIT */}
            {view === "audit" && (
              <div className="twrap">
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr><th>Time</th><th>User</th><th>Action</th><th>Control No</th><th>From</th><th>To</th></tr>
                    </thead>
                    <tbody>
                      {audit.map((a, i) => (
                        <tr key={i}>
                          <td className="mono">{a.timestamp}</td>
                          <td>{a.user}</td>
                          <td>{a.action}</td>
                          <td className="mono">{a.controlNo}</td>
                          <td style={{ color: "var(--text2)" }}>{a.oldVal || "—"}</td>
                          <td>{a.newVal || "—"}</td>
                        </tr>
                      ))}
                      {audit.length === 0 && (
                        <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>No audit records.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print Receiving Sheet modal */}
      {showPrint && (
        <div className="print-overlay">
          <style>{`@media print { @page { size: ${PAPER[paperSize]}; margin: 10mm; } }`}</style>
          <div className="print-toolbar no-print">
            <div>
              <h3>🧾 Print Receiving Sheet</h3>
              <p>{printQueue.length} document{printQueue.length !== 1 ? "s" : ""} for printing</p>
            </div>
            <div className="pt-right">
              <label className="pt-paper">
                Paper Size
                <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as "long" | "a4" | "short")}>
                  <option value="long">Long (8.5 × 13 in)</option>
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="short">Short (8.5 × 11 in)</option>
                </select>
              </label>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ Print Now</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPrint(false)}>✕ Close</button>
            </div>
          </div>

          <div className="print-scroll">
            <div className="print-sheet">
              <div className="ps-head">
                <div className="ps-office">OFFICE OF THE PROVINCIAL PUBLIC EMPLOYMENT SERVICE MANAGER (OPPESM)</div>
                <div className="ps-title">Document Receiving Sheet</div>
                <div className="ps-sub">Outgoing Documents — For Printing Queue</div>
              </div>
              <div className="ps-printed">Printed: {printedStamp()}</div>
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Control No.</th>
                    <th>Title of Document</th>
                    <th>Description</th>
                    {Array.from({ length: printCols }).map((_, i) => (
                      <th key={i}>Received by {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {printQueue.map((d) => {
                    const list = receiversByControl[d.controlNo]?.length
                      ? receiversByControl[d.controlNo]
                      : ["Concern Office"];
                    return (
                      <tr key={d.controlNo}>
                        <td>{d.timestamp}</td>
                        <td className="mono">{d.controlNo}</td>
                        <td>{d.title}</td>
                        <td>{d.description}</td>
                        {Array.from({ length: printCols }).map((_, i) => (
                          <td key={i} className="ps-recv">
                            {i < list.length && (
                              <div className="ps-recv-block">
                                <div className="ps-office-name">{list[i]}</div>
                                <div className="ps-line"><span>Name:</span><i /></div>
                                <div className="ps-line"><span>Signature:</span><i /></div>
                                <div className="ps-line"><span>Date:</span><i /></div>
                                <div className="ps-line"><span>Time:</span><i /></div>
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {printQueue.length === 0 && (
                    <tr><td colSpan={4 + printCols} style={{ textAlign: "center", padding: 20 }}>Nothing queued for printing.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {openProcess && (() => {
        const proc = processData.processes.find((p) => p.trackingNo === openProcess);
        if (!proc) return null;
        return (
          <ProcessPanel
            process={proc}
            docs={docs.filter((d) => d.trackingNo === proc.trackingNo)}
            notes={processData.notes.filter((n) => n.trackingNo === proc.trackingNo)}
            officeSuggestions={officeSuggestions}
            connected={connected}
            onClose={() => setOpenProcess(null)}
            onAddNote={(office, note) => addNote(proc.trackingNo, office, note)}
            onSetStatus={(status) => setStatus(proc.trackingNo, status)}
            onUnlink={unlinkDoc}
            onLink={(controlNo) => linkDoc(controlNo, proc.trackingNo)}
          />
        );
      })()}

      {threadFor && (
        <TaskThread
          controlNo={threadFor.controlNo}
          title={threadFor.title}
          staff={staff}
          connected={connected}
          initialTab={threadFor.tab}
          onClose={() => setThreadFor(null)}
        />
      )}

      {toast && (
        <div className={"toast show" + (toast.error ? " error" : "")}>
          <div className="t-title">{toast.title}</div>
          <div className="t-body">{toast.body}</div>
        </div>
      )}
    </div>
  );
}

function printedStamp(): string {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

function Stat({ label, value, sub, cls, ico }: { label: string; value: number; sub: string; cls: string; ico: string }) {
  return (
    <div className={"scard " + cls}>
      <div className="slbl">{label}</div>
      <div className="sval">{value}</div>
      <div className="ssub">{sub}</div>
      <div className="sico">{ico}</div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="leg-item">
      <span className="leg-dot" style={{ background: color }} />
      {label}
      <span className="leg-val">{value}</span>
    </div>
  );
}

const ADMIN_CSS = `
.admin-scope .app-shell { min-height: 100vh; position: relative; z-index: 1; }
.admin-scope .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar); background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 10; }
.admin-scope .sb-brand { padding: 22px 18px; border-bottom: 1px solid var(--border); }
.admin-scope .sb-brand .lbl { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 4px; }
.admin-scope .sb-brand h3 { font-size: 15px; font-weight: 700; }
.admin-scope .sb-brand p { font-size: 11px; color: var(--text2); margin-top: 2px; }
.admin-scope .sb-nav { flex: 1; padding: 14px 10px; overflow-y: auto; }
.admin-scope .nav-sec { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text3); padding: 0 8px; margin: 14px 0 6px; }
.admin-scope .nav-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text2); transition: background .12s, color .12s; margin-bottom: 2px; border: none; background: none; width: 100%; text-align: left; font-family: inherit; }
.admin-scope .nav-item:hover { background: var(--surface2); color: var(--text); }
.admin-scope .nav-item.active { background: rgba(79,142,247,.12); color: var(--accent); font-weight: 600; }
.admin-scope .nav-item .ico { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0; }
.admin-scope .nbadge { margin-left: auto; border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: 700; }
.admin-scope .nbadge.orange { background: var(--orange); color: #fff; }
.admin-scope .nbadge.yellow { background: var(--warn); color: #000; }
.admin-scope .nbadge.blue { background: var(--accent); color: #fff; }
.admin-scope .nbadge.purple { background: var(--purple); color: #fff; }
.admin-scope .trk-chip { display: block; margin-top: 4px; background: rgba(167,139,250,.12); color: var(--purple); border: 1px solid rgba(167,139,250,.3); border-radius: 20px; padding: 1px 8px; font-family: "IBM Plex Mono", monospace; font-size: 10px; cursor: pointer; white-space: nowrap; }
.admin-scope .trk-chip:hover { background: rgba(167,139,250,.22); }
.admin-scope .pr-intro { font-size: 12px; color: var(--text2); margin-bottom: 12px; line-height: 1.5; }
.admin-scope .pr-intro b { color: var(--text); }
.admin-scope .pr-row { cursor: pointer; }
.admin-scope .pr-tn { color: var(--purple); font-weight: 600; white-space: nowrap; }
.admin-scope .pr-stage { color: var(--text2); min-width: 160px; }
.admin-scope .pr-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0; }
.admin-scope .pr-chip-wrap { display: inline-flex; align-items: center; }
.admin-scope .pr-arrow { color: var(--text3); font-size: 10px; margin: 0 4px; }
.admin-scope .pr-more { color: var(--text3); font-size: 10px; margin-right: 4px; }
.admin-scope .pr-chip { padding: 2px 7px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.admin-scope .pr-chip.in { background: rgba(79,142,247,.15); color: var(--accent); }
.admin-scope .pr-chip.out { background: rgba(167,139,250,.15); color: var(--purple); }
.admin-scope .pr-chip.note { background: rgba(251,191,36,.12); color: var(--warn); font-weight: 600; }
.admin-scope .sb-foot { padding: 14px 18px; border-top: 1px solid var(--border); }
.admin-scope .sb-user { font-size: 11px; color: var(--text3); margin-bottom: 8px; }
.admin-scope .sb-user b { color: var(--text2); font-weight: 600; }
.admin-scope .back-btn { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); cursor: pointer; background: none; border: none; font-family: inherit; transition: color .2s; padding: 0; width: 100%; text-align: left; }
.admin-scope .back-btn:hover { color: var(--text); }
.admin-scope .main { margin-left: var(--sidebar); min-height: 100vh; }
.admin-scope .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 15px 26px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 5; }
.admin-scope .topbar h1 { font-size: 17px; font-weight: 700; }
.admin-scope .topbar .tsub { font-size: 11px; color: var(--text2); margin-top: 2px; }
.admin-scope .topbar-right { display: flex; gap: 8px; align-items: center; }
.admin-scope .content { padding: 22px 24px; }
.admin-scope .btn { padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s, transform .1s; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.admin-scope .btn:hover:not(:disabled) { opacity: .85; transform: translateY(-1px); }
.admin-scope .btn-primary { background: var(--accent); color: #fff; }
.admin-scope .btn-outline { background: transparent; color: var(--text2); border: 1px solid var(--border); }
.admin-scope .btn-outline:hover { color: var(--text); border-color: var(--text3); }
.admin-scope .btn-danger { background: rgba(248,113,113,.15); color: var(--danger); border: 1px solid rgba(248,113,113,.3); }
.admin-scope .btn-success { background: rgba(110,231,183,.15); color: var(--accent2); border: 1px solid rgba(110,231,183,.3); }
.admin-scope .btn-sm { padding: 5px 10px; font-size: 11px; }
.admin-scope .btn-xs { padding: 3px 8px; font-size: 10px; }
.admin-scope .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.admin-scope .scard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; position: relative; overflow: hidden; transition: border-color .2s, transform .18s; }
.admin-scope .scard:hover { transform: translateY(-2px); border-color: var(--accent); }
.admin-scope .scard::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; border-radius: 0 0 12px 12px; }
.admin-scope .scard.c-blue::after { background: var(--accent); }
.admin-scope .scard.c-green::after { background: var(--accent2); }
.admin-scope .scard.c-yellow::after { background: var(--warn); }
.admin-scope .scard.c-orange::after { background: var(--orange); }
.admin-scope .scard.c-red::after { background: var(--danger); }
.admin-scope .slbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); margin-bottom: 8px; }
.admin-scope .sval { font-size: 34px; font-weight: 700; font-family: "IBM Plex Mono", monospace; line-height: 1; }
.admin-scope .ssub { font-size: 11px; color: var(--text3); margin-top: 5px; }
.admin-scope .sico { position: absolute; top: 14px; right: 14px; font-size: 22px; opacity: .2; }
.admin-scope .charts-row { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; margin-bottom: 20px; }
.admin-scope .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 20px; }
.admin-scope .chart-title { font-size: 12px; font-weight: 700; margin-bottom: 14px; color: var(--text2); text-transform: uppercase; letter-spacing: .8px; }
.admin-scope .bar-chart { display: flex; align-items: flex-end; gap: 5px; height: 90px; }
.admin-scope .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; justify-content: flex-end; }
.admin-scope .bar { width: 100%; border-radius: 3px 3px 0 0; background: var(--accent); opacity: .65; min-height: 3px; transition: opacity .2s; }
.admin-scope .bar:hover { opacity: 1; }
.admin-scope .bar-lbl { font-size: 8px; color: var(--text3); }
.admin-scope .leg-item { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--text2); margin-bottom: 8px; }
.admin-scope .leg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.admin-scope .leg-val { margin-left: auto; font-family: "IBM Plex Mono", monospace; font-weight: 600; color: var(--text); font-size: 12px; }
.admin-scope .activity-list { display: flex; flex-direction: column; }
.admin-scope .act-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.admin-scope .act-item:last-child { border-bottom: none; }
.admin-scope .act-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-top: 5px; flex-shrink: 0; }
.admin-scope .act-action { font-size: 12px; font-weight: 600; }
.admin-scope .act-cn { font-size: 11px; color: var(--accent); font-family: "IBM Plex Mono", monospace; }
.admin-scope .act-meta { font-size: 10px; color: var(--text3); margin-top: 1px; }
.admin-scope .tbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.admin-scope .sinput { padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12px; font-family: inherit; flex: 1; min-width: 160px; }
.admin-scope .sinput:focus { outline: none; border-color: var(--accent); }
.admin-scope .fsel { padding: 8px 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12px; font-family: inherit; cursor: pointer; }
.admin-scope .fsel:focus { outline: none; border-color: var(--accent); }
.admin-scope .mini-sel { padding: 4px 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 11px; font-family: inherit; cursor: pointer; }
.admin-scope .twrap { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.admin-scope table { width: 100%; border-collapse: collapse; }
.admin-scope thead { background: var(--surface2); }
.admin-scope th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); border-bottom: 1px solid var(--border); white-space: nowrap; }
.admin-scope td { padding: 9px 12px; font-size: 12px; color: var(--text); border-bottom: 1px solid var(--border); vertical-align: middle; }
.admin-scope tr:last-child td { border-bottom: none; }
.admin-scope tbody tr:hover { background: rgba(255,255,255,.02); }
.admin-scope .mono { font-family: "IBM Plex Mono", monospace; font-size: 11px; }
.admin-scope .desc-cell { max-width: 260px; }
.admin-scope .desc-clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text2); cursor: help; transition: color .15s; }
.admin-scope .desc-cell:hover .desc-clip { -webkit-line-clamp: unset; overflow: visible; white-space: normal; color: var(--text); }
.admin-scope .deadline-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 12px; font-size: 11px; color: var(--text2); align-items: center; }
.admin-scope .deadline-legend .dl-title { font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text3); }
.admin-scope .deadline-legend .ld { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
.admin-scope .deadline-legend .ld.ontrack { background: var(--accent); }
.admin-scope .deadline-legend .ld.yellow { background: var(--warn); }
.admin-scope .deadline-legend .ld.orange { background: var(--orange); }
.admin-scope .deadline-legend .ld.red { background: var(--danger); }
.admin-scope .deadline-legend .ld.green { background: var(--accent2); }
.admin-scope .act-btns { display: flex; gap: 4px; flex-wrap: wrap; }
.admin-scope .tcount { margin-top: 7px; font-size: 11px; color: var(--text3); }
.admin-scope .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; white-space: nowrap; }
.admin-scope .badge-blue { background: rgba(79,142,247,.15); color: var(--accent); }
.admin-scope .badge-green { background: rgba(110,231,183,.15); color: var(--accent2); }
.admin-scope .badge-yellow { background: rgba(251,191,36,.15); color: var(--warn); }
.admin-scope .badge-red { background: rgba(248,113,113,.15); color: var(--danger); }
.admin-scope .badge-gray { background: rgba(136,145,179,.15); color: var(--text2); }
.admin-scope .badge-purple { background: rgba(167,139,250,.15); color: var(--purple); }
.admin-scope .badge-orange { background: rgba(251,146,60,.15); color: var(--orange); }
.admin-scope .btn-warn { background: rgba(251,191,36,.15); color: var(--warn); border: 1px solid rgba(251,191,36,.3); }
.admin-scope .fp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
.admin-scope .fp-info h2 { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.admin-scope .fp-info p { font-size: 12px; color: var(--text2); margin-top: 4px; max-width: 560px; line-height: 1.5; }
.admin-scope .fp-info p b { color: var(--accent2); }
.admin-scope .fp-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.admin-scope .fp-pending { font-size: 11px; font-weight: 700; color: var(--orange); background: rgba(251,146,60,.12); border: 1px solid rgba(251,146,60,.3); padding: 5px 12px; border-radius: 20px; }
.admin-scope .fp-empty { background: var(--surface); border: 1px dashed var(--border); border-radius: 12px; padding: 40px; text-align: center; color: var(--text3); font-size: 13px; }
.admin-scope .fp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.admin-scope .fp-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; position: relative; overflow: hidden; }
.admin-scope .fp-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--orange), var(--warn)); }
.admin-scope .fp-cn { font-family: "IBM Plex Mono", monospace; font-size: 13px; font-weight: 600; color: var(--orange); margin-top: 4px; }
.admin-scope .fp-title { font-size: 15px; font-weight: 700; margin-top: 6px; }
.admin-scope .fp-desc { font-size: 12px; color: var(--text2); margin-top: 3px; line-height: 1.5; }
.admin-scope .fp-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text3); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
.admin-scope .fp-card-actions { display: flex; gap: 8px; margin-top: 14px; align-items: center; }
.admin-scope .fp-mark { flex: 1; justify-content: center; }
.admin-scope .fp-edit { padding: 6px 10px; }
.admin-scope .print-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(6,9,16,.85); display: flex; flex-direction: column; }
.admin-scope .print-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--border); }
.admin-scope .print-toolbar h3 { font-size: 15px; font-weight: 700; }
.admin-scope .print-toolbar p { font-size: 11px; color: var(--text2); margin-top: 2px; }
.admin-scope .pt-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.admin-scope .pt-paper { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text2); }
.admin-scope .pt-paper select { padding: 6px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 12px; font-family: inherit; cursor: pointer; }
.admin-scope .print-scroll { flex: 1; overflow: auto; padding: 24px; display: flex; justify-content: center; align-items: flex-start; }
.admin-scope .print-sheet { background: #fff; color: #111; width: 100%; max-width: 1050px; padding: 28px 32px; border-radius: 4px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.admin-scope .ps-head { text-align: center; }
.admin-scope .ps-office { font-size: 13px; font-weight: 700; color: #1e3a5f; letter-spacing: .5px; }
.admin-scope .ps-title { font-size: 20px; font-weight: 700; color: #111; margin-top: 4px; }
.admin-scope .ps-sub { font-size: 12px; color: #555; margin-top: 2px; }
.admin-scope .ps-printed { text-align: right; font-size: 11px; color: #666; margin: 14px 0 6px; }
.admin-scope .ps-table { width: 100%; border-collapse: collapse; }
.admin-scope .ps-table th { background: #1e3a5f; color: #fff; font-size: 10px; letter-spacing: .5px; padding: 8px 6px; border: 1px solid #1e3a5f; text-align: center; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.admin-scope .ps-table td { border: 1px solid #999; padding: 8px 8px; font-size: 11px; color: #111; vertical-align: top; }
.admin-scope .ps-table .mono { color: #111; font-size: 11px; }
.admin-scope .ps-recv { min-width: 150px; }
.admin-scope .ps-office-name { font-size: 10px; font-weight: 700; color: #1e3a5f; text-transform: uppercase; margin-bottom: 6px; }
.admin-scope .ps-line { display: flex; align-items: flex-end; gap: 4px; font-size: 10px; color: #333; margin-top: 5px; }
.admin-scope .ps-line span { white-space: nowrap; }
.admin-scope .ps-line i { flex: 1; border-bottom: 1px solid #333; height: 11px; }
.admin-scope .toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent2); border-radius: 10px; padding: 14px 20px; font-size: 14px; color: var(--text); box-shadow: 0 8px 24px rgba(0,0,0,.4); z-index: 999; max-width: 320px; }
.admin-scope .toast.error { border-left-color: var(--danger); }
.admin-scope .toast .t-title { font-weight: 700; margin-bottom: 4px; }
.admin-scope .toast .t-body { color: var(--text2); font-size: 12px; }
@media (max-width: 900px) {
  .admin-scope .sidebar { display: none; }
  .admin-scope .main { margin-left: 0; }
  .admin-scope .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .admin-scope .charts-row { grid-template-columns: 1fr; }
}
@media print {
  body::before { display: none !important; }
  .admin-scope .app-shell { display: none !important; }
  .admin-scope .print-toolbar, .admin-scope .toast { display: none !important; }
  .admin-scope .print-overlay { position: static !important; inset: auto !important; background: #fff !important; display: block !important; }
  .admin-scope .print-scroll { overflow: visible !important; padding: 0 !important; display: block !important; }
  .admin-scope .print-sheet { box-shadow: none !important; max-width: none !important; width: auto !important; padding: 0 !important; border-radius: 0 !important; }
}
`;
