import { backendGet, backendPost } from "@/lib/sheet";
import { sampleTaskControlNos } from "@/lib/documents";

export interface ChatMessage {
  id: string;
  controlNo: string;
  author: string;
  message: string;
  createdAt: string; // ISO 8601
}

interface ChatRow {
  id?: string;
  controlNo?: string;
  author?: string;
  message?: string;
  createdAt?: string;
}

function isoDaysAgo(days: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Sample thread for local preview, attached to the sample tasks.
export function sampleChat(): ChatMessage[] {
  const { onTrack, overdue } = sampleTaskControlNos();
  return [
    { id: "c1", controlNo: onTrack, author: "Ana Reyes", message: "Started pulling the Q3 figures. Will share a draft by Friday.", createdAt: isoDaysAgo(1, 9, 5) },
    { id: "c2", controlNo: onTrack, author: "Maria Eva Basalo", message: "Thanks Ana — please include the SPES placements too.", createdAt: isoDaysAgo(0, 8, 40) },
    { id: "c3", controlNo: overdue, author: "Jose Cruz", message: "Coordinated with Finance; payroll release moved to next week.", createdAt: isoDaysAgo(3, 14, 12) },
    { id: "c4", controlNo: overdue, author: "Jose Cruz", message: "Still waiting on the confirmed schedule — will follow up today.", createdAt: isoDaysAgo(1, 10, 30) },
  ];
}

/** Messages for one task, oldest first. */
export async function getChat(controlNo: string): Promise<ChatMessage[]> {
  const rows = await backendGet<ChatRow[]>("chat", { controlNo });
  const list = rows
    ? rows.map((r) => ({
        id: String(r.id ?? "").trim(),
        controlNo: String(r.controlNo ?? "").trim(),
        author: String(r.author ?? "").trim() || "Unknown",
        message: String(r.message ?? "").trim(),
        createdAt: String(r.createdAt ?? "").trim(),
      }))
    : sampleChat().filter((m) => m.controlNo === controlNo);

  return list
    .filter((m) => m.message)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addChat(controlNo: string, author: string, message: string) {
  return backendPost({ action: "addChat", controlNo, author, message });
}
