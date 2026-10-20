import { backendGet, backendPost } from "@/lib/sheet";
import { sampleEmailControlNo } from "@/lib/documents";
import type { EmailCandidate, EmailThread } from "@/lib/email-types";

function isoDaysAgo(days: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Sample conversation for local preview — matches the sample "Email" document.
function sampleThread(): EmailThread {
  return {
    linked: true,
    threadId: "demo-thread",
    subject: "Inquiry: SPES application schedule",
    permalink: "#",
    mailbox: "peso@bataan.gov.ph",
    messages: [
      {
        id: "m1",
        from: "Juan Dela Cruz <juan.delacruz@example.com>",
        to: "peso@bataan.gov.ph",
        cc: "",
        date: isoDaysAgo(2, 8, 47),
        subject: "Inquiry: SPES application schedule",
        body:
          "Good morning,\n\nMay I ask when the application period for the Special Program for Employment of Students (SPES) " +
          "will open this year, and what documents my son needs to prepare?\n\nThank you,\nJuan Dela Cruz",
        attachments: [],
        mine: false,
      },
    ],
  };
}

/** The Gmail conversation linked to a document. */
export async function getEmailThread(controlNo: string): Promise<EmailThread> {
  const data = await backendGet<EmailThread>("email", { controlNo });
  if (!data) return controlNo === sampleEmailControlNo() ? sampleThread() : { linked: false };
  return data;
}

/** Recent conversations from a sender (for re-linking). */
export async function getEmailCandidates(from: string): Promise<EmailCandidate[]> {
  const data = await backendGet<EmailCandidate[]>("emailCandidates", { from });
  if (!data) {
    const t = sampleThread();
    return [{ threadId: "demo-thread", subject: t.subject!, date: t.messages![0].date, messageCount: 1, snippet: t.messages![0].body.slice(0, 140) }];
  }
  return Array.isArray(data) ? data : [];
}

export async function linkEmail(controlNo: string, threadId: string, user: string) {
  return backendPost({ action: "linkEmail", controlNo, threadId, user });
}

export async function sendEmailReply(payload: {
  controlNo: string;
  body: string;
  replyAll: boolean;
  signature: string;
  files: { name: string; type: string; data: string }[];
  user: string;
}) {
  return backendPost({ action: "sendEmailReply", ...payload });
}
