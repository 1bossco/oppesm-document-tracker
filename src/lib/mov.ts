import { backendGet, backendPost } from "@/lib/sheet";
import { sampleTaskControlNos } from "@/lib/documents";

export interface MovItem {
  id: string;
  controlNo: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  note: string;
  createdAt: string; // ISO 8601
}

interface MovRow {
  id?: string;
  controlNo?: string;
  uploadedBy?: string;
  fileName?: string;
  fileUrl?: string;
  note?: string;
  createdAt?: string;
}

// Sample MOV entries for local preview.
export function sampleMov(): MovItem[] {
  const { overdue } = sampleTaskControlNos();
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return [
    {
      id: "m1",
      controlNo: overdue,
      uploadedBy: "Jose Cruz",
      fileName: "finance-coordination.pdf",
      fileUrl: "#",
      note: "Email thread with Finance confirming the revised payroll schedule.",
      createdAt: d.toISOString(),
    },
  ];
}

/** MOV files for one task, newest first. */
export async function getMov(controlNo: string): Promise<MovItem[]> {
  const rows = await backendGet<MovRow[]>("mov", { controlNo });
  const list = rows
    ? rows.map((r) => ({
        id: String(r.id ?? "").trim(),
        controlNo: String(r.controlNo ?? "").trim(),
        uploadedBy: String(r.uploadedBy ?? "").trim() || "Unknown",
        fileName: String(r.fileName ?? "").trim(),
        fileUrl: String(r.fileUrl ?? "").trim(),
        note: String(r.note ?? "").trim(),
        createdAt: String(r.createdAt ?? "").trim(),
      }))
    : sampleMov().filter((m) => m.controlNo === controlNo);

  return list
    .filter((m) => m.fileName)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addMov(
  controlNo: string,
  uploadedBy: string,
  note: string,
  file: { name: string; type: string; data: string }
) {
  return backendPost({ action: "addMov", controlNo, uploadedBy, note, file });
}
