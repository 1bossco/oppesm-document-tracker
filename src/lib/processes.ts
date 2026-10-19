import { backendGet, backendPost, isBackendConnected } from "@/lib/sheet";
import { sampleTrackingNo } from "@/lib/documents";
import type { Process, ProcessData, ProcessNote } from "@/lib/timeline";

interface RawProcessData {
  processes?: Partial<Record<keyof Process, string>>[];
  notes?: Partial<Record<keyof ProcessNote, string>>[];
}

function isoDaysAgo(days: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Sample process for local preview — matches the "Project Proposal" sample docs.
export function buildSampleProcessData(): ProcessData {
  const tr = sampleTrackingNo();
  return {
    processes: [
      { trackingNo: tr, subject: "Project Proposal", status: "Open", createdAt: isoDaysAgo(6, 14, 10), closedAt: "", createdBy: "Rovinnel Soriano" },
    ],
    notes: [
      { id: "pn1", trackingNo: tr, office: "OPPESM", note: "PR prepared", by: "Rovinnel Soriano", createdAt: isoDaysAgo(4, 9, 20) },
      { id: "pn2", trackingNo: tr, office: "Accounting", note: "ObR signed", by: "Jinky Recio", createdAt: isoDaysAgo(2, 15, 45) },
    ],
  };
}

/** All tracked processes + their timeline notes. */
export async function getProcessData(): Promise<ProcessData> {
  const data = await backendGet<RawProcessData>("processes");
  // Connected but unreadable (e.g. Code.gs not updated yet) → empty, never sample data.
  if (!data || !Array.isArray(data.processes)) {
    return isBackendConnected() ? { processes: [], notes: [] } : buildSampleProcessData();
  }

  const str = (v: unknown) => String(v ?? "").trim();
  return {
    processes: data.processes
      .map((p) => ({
        trackingNo: str(p.trackingNo),
        subject: str(p.subject),
        status: (["Open", "Completed", "Cancelled"].includes(str(p.status)) ? str(p.status) : "Open") as Process["status"],
        createdAt: str(p.createdAt),
        closedAt: str(p.closedAt),
        createdBy: str(p.createdBy),
      }))
      .filter((p) => p.trackingNo),
    notes: (Array.isArray(data.notes) ? data.notes : [])
      .map((n) => ({
        id: str(n.id),
        trackingNo: str(n.trackingNo),
        office: str(n.office),
        note: str(n.note),
        by: str(n.by),
        createdAt: str(n.createdAt),
      }))
      .filter((n) => n.trackingNo),
  };
}

// `user` is the signed-in admin's name, recorded in the Audit Trail.
export async function linkDocument(controlNo: string, ref: string, user: string) {
  return backendPost({ action: "linkDocument", controlNo, ref, user });
}

export async function unlinkDocument(controlNo: string, user: string) {
  return backendPost({ action: "unlinkDocument", controlNo, user });
}

export async function addProcessNote(trackingNo: string, office: string, note: string, user: string) {
  return backendPost({ action: "addProcessNote", trackingNo, office, note, user });
}

export async function setProcessStatus(trackingNo: string, status: Process["status"], user: string) {
  return backendPost({ action: "setProcessStatus", trackingNo, status, user });
}
