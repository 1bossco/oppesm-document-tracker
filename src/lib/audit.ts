import { backendGet } from "@/lib/sheet";

export interface AuditEntry {
  timestamp: string;
  user: string;
  action: string;
  controlNo: string;
  oldVal: string;
  newVal: string;
}

interface AuditRow {
  timestamp?: string;
  user?: string;
  action?: string;
  controlNo?: string;
  oldVal?: string;
  newVal?: string;
}

// Sample audit trail for local preview.
export const sampleAudit: AuditEntry[] = [
  { timestamp: "2026-07-15 10:40", user: "Jose Cruz", action: "Submit", controlNo: "OG-260715-001", oldVal: "", newVal: "Submitted" },
  { timestamp: "2026-07-15 09:12", user: "Maria Santos", action: "Submit", controlNo: "IN-260715-001", oldVal: "", newVal: "Submitted" },
  { timestamp: "2026-07-14 15:30", user: "Admin", action: "Mark Printed", controlNo: "OG-260714-002", oldVal: "For Printing", newVal: "Printed → Done" },
  { timestamp: "2026-07-14 14:05", user: "Ana Reyes", action: "Submit", controlNo: "OG-260714-002", oldVal: "", newVal: "Submitted" },
  { timestamp: "2026-07-14 11:20", user: "Maria Santos", action: "Submit", controlNo: "IN-260714-001", oldVal: "", newVal: "Submitted" },
  { timestamp: "2026-07-14 12:10", user: "Admin", action: "Update statusDoc", controlNo: "IN-260714-001", oldVal: "In Progress", newVal: "Follow-up" },
];

/** Audit trail, newest first. */
export async function getAuditTrail(): Promise<AuditEntry[]> {
  const rows = await backendGet<AuditRow[]>("audit");
  if (!rows) return sampleAudit;

  return rows
    .map((r) => ({
      timestamp: String(r.timestamp ?? "").trim(),
      user: String(r.user ?? "").trim(),
      action: String(r.action ?? "").trim(),
      controlNo: String(r.controlNo ?? "").trim(),
      oldVal: String(r.oldVal ?? "").trim(),
      newVal: String(r.newVal ?? "").trim(),
    }))
    .filter((r) => r.timestamp !== "");
}
