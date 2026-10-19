// Types + pure helpers for tracked processes. No server imports, so client
// components can use these directly.
import type { TrackedDocument } from "@/lib/documents";

export type ProcessStatus = "Open" | "Completed" | "Cancelled";

export interface Process {
  trackingNo: string;
  subject: string;
  status: ProcessStatus;
  createdAt: string; // ISO 8601
  closedAt: string; // ISO 8601, empty while open
  createdBy: string;
}

export interface ProcessNote {
  id: string;
  trackingNo: string;
  office: string;
  note: string;
  by: string;
  createdAt: string; // ISO 8601
}

export interface ProcessData {
  processes: Process[];
  notes: ProcessNote[];
}

export type TimelineEvent =
  | { kind: "IN" | "OUT"; time: number; doc: TrackedDocument }
  | { kind: "NOTE"; time: number; note: ProcessNote };

const DAY = 86400000;

/**
 * Epoch ms for a sheet timestamp. Document timestamps are "yyyy-MM-dd HH:mm"
 * in Manila time; notes and process dates are ISO strings.
 */
export function eventTime(ts: string): number {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (m) return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`) || 0;
  return Date.parse(ts) || 0;
}

/** All steps (documents + notes) of one process, oldest first. */
export function buildTimeline(docs: TrackedDocument[], notes: ProcessNote[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...docs.map((doc) => ({
      kind: (doc.docType === "Incoming Docs" ? "IN" : "OUT") as "IN" | "OUT",
      time: eventTime(doc.timestamp),
      doc,
    })),
    ...notes.map((note) => ({ kind: "NOTE" as const, time: eventTime(note.createdAt), note })),
  ];
  return events.sort((a, b) => a.time - b.time);
}

/**
 * Mirrors the backend rule: an open process auto-completes when its latest
 * document is an Outgoing marked Done and it has at least one earlier document.
 */
export function shouldAutoComplete(docs: TrackedDocument[]): boolean {
  if (docs.length < 2) return false;
  const last = [...docs].sort((a, b) => eventTime(a.timestamp) - eventTime(b.timestamp))[docs.length - 1];
  return last.docType === "Outgoing Docs" && last.progress === "Done";
}

/** "3 days", "5 hours", "just now". */
export function formatSpan(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms >= DAY) {
    const d = Math.floor(ms / DAY);
    return `${d} day${d !== 1 ? "s" : ""}`;
  }
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h} hour${h !== 1 ? "s" : ""}`;
  return "less than an hour";
}

export function formatWhen(time: number): string {
  if (!time) return "—";
  return new Date(time).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatShortDate(time: number): string {
  if (!time) return "—";
  return new Date(time).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}
