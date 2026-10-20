// Types + pure helpers for the Gmail-linked "Email" documents. No server
// imports, so client components can use these directly.

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string; // ISO 8601
  subject: string;
  body: string; // plain text
  attachments: { name: string; size: number }[];
  mine: boolean; // sent by the PESO mailbox
}

export interface EmailThread {
  linked: boolean;
  error?: string;
  threadId?: string;
  subject?: string;
  permalink?: string;
  mailbox?: string;
  messages?: EmailMessage[];
}

export interface EmailCandidate {
  threadId: string;
  subject: string;
  date: string;
  messageCount: number;
  snippet: string;
}

/** Title of Document that marks an Incoming document as an email. */
export function isEmailTitle(title: string): boolean {
  return title.trim().toLowerCase() === "email";
}

export const EMAIL_PATTERN = /^[^\s@"'()<>,;:\\]+@[^\s@"'()<>,;:\\]+\.[^\s@"'()<>,;:\\]+$/;

/** "Soriano, Rovinnel Manuel" → "Rovinnel Manuel Soriano". */
export function displayName(name: string): string {
  const [last, rest] = name.split(",").map((s) => s.trim());
  return rest ? `${rest} ${last}` : name.trim();
}

/** Reply signature: name and position. */
export function signatureFor(name: string, position: string): string {
  return ["— " + displayName(name), position].filter((s) => s && s !== "— ").join("\n");
}
