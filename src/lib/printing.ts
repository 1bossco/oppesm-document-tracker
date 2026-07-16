import { backendGet } from "@/lib/sheet";

export interface PrintRow {
  timestamp: string;
  controlNo: string;
  title: string;
  description: string;
  receivers: string[];
}

export interface PrintData {
  rows: PrintRow[];
  maxReceivers: number;
}

interface RawPrintRow {
  timestamp?: string;
  controlNo?: string;
  title?: string;
  description?: string;
  receivers?: string[];
}

// Sample "For Printing" data for local preview. Built with control numbers that
// match the two "For Printing" sample documents so the receiving sheet shows
// real receiver offices in demo mode.
function offsetControl(prefix: string, daysAgo: number, seq: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const yy = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}-${yy}${m}${dd}-${String(seq).padStart(3, "0")}`;
}
function offsetTs(daysAgo: number, hhmm: string): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd} ${hhmm}`;
}

export function buildSamplePrintData(): PrintData {
  return {
    maxReceivers: 3,
    rows: [
      {
        timestamp: offsetTs(5, "14:05"),
        controlNo: offsetControl("OG", 5, 1),
        title: "Endorsement Letter to DOLE",
        description: "Endorsement of qualified applicants for SPES.",
        receivers: ["DOLE Regional Office", "Provincial Governor's Office", "OPPESM File"],
      },
      {
        timestamp: offsetTs(7, "08:30"),
        controlNo: offsetControl("OG", 7, 1),
        title: "Notice of Meeting",
        description: "Notice for the quarterly Provincial Employment coordination meeting.",
        receivers: ["All Municipal PESO Managers", "OPPESM File"],
      },
    ],
  };
}

/** Rows marked "For Printing", with receiver offices per title. */
export async function getPrintData(): Promise<PrintData> {
  const data = await backendGet<PrintData>("printing");
  if (!data || !Array.isArray(data.rows)) return buildSamplePrintData();

  const rows: PrintRow[] = data.rows.map((r: RawPrintRow) => ({
    timestamp: String(r.timestamp ?? "").trim(),
    controlNo: String(r.controlNo ?? "").trim(),
    title: String(r.title ?? "").trim(),
    description: String(r.description ?? "").trim(),
    receivers: Array.isArray(r.receivers) ? r.receivers.filter(Boolean) : [],
  }));

  const maxReceivers = Math.max(
    1,
    Number(data.maxReceivers) || 0,
    ...rows.map((r) => r.receivers.length)
  );

  return { rows, maxReceivers };
}
