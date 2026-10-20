import { backendGet } from "@/lib/sheet";

export interface TitleOption {
  title: string;
  processingTime: string;
}

interface TitleRow {
  title?: string;
  processingTime?: string;
}

// Sample titles for local preview (mirrors the "Title of Document" sheet).
export const sampleTitles: TitleOption[] = [
  { title: "Request for Job Fair Assistance", processingTime: "3 days" },
  { title: "Endorsement Letter to DOLE", processingTime: "5 days" },
  { title: "Memorandum on PESO Activities", processingTime: "2 days" },
  { title: "Complaint Referral", processingTime: "7 days" },
  { title: "Notice of Meeting", processingTime: "1 day" },
  { title: "Certificate of Employment", processingTime: "3 days" },
  { title: "Special Program for Employment of Students (SPES) Forms", processingTime: "5 days" },
  { title: "Email", processingTime: "3 days" },
];

/** Titles + processing times for the submission dropdown. */
export async function getTitles(): Promise<TitleOption[]> {
  const rows = await backendGet<TitleRow[]>("titles");
  if (!rows) return sampleTitles;

  const titles = rows
    .map((r) => ({
      title: String(r.title ?? "").trim(),
      processingTime: String(r.processingTime ?? "").trim(),
    }))
    .filter((t) => t.title !== "");

  return titles.length > 0 ? titles : sampleTitles;
}
