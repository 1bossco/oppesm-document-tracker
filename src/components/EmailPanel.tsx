"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackedDocument } from "@/lib/documents";
import type { EmailCandidate, EmailMessage, EmailThread } from "@/lib/email-types";
import { MAX_UPLOAD_BYTES, blobToBase64, formatBytes, prepareFile, type PreparedFile } from "@/lib/image";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Side panel for an Incoming "Email" document: read the Gmail conversation
// and reply from peso@bataan.gov.ph without opening Gmail.
export function EmailPanel({
  doc,
  adminName,
  signature,
  connected,
  onClose,
  onReplySent,
  onLinked,
}: {
  doc: TrackedDocument;
  adminName: string;
  signature: string;
  connected: boolean;
  onClose: () => void;
  onReplySent: (result: { controlNo: string; trackingNo: string; warning?: string }) => void;
  onLinked: () => void;
}) {
  const [thread, setThread] = useState<EmailThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickFrom, setPickFrom] = useState("");
  const [candidates, setCandidates] = useState<EmailCandidate[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const assigned = doc.staff.includes(adminName);
  const totalBytes = files.reduce((n, f) => n + f.blob.size, 0);
  const messages: EmailMessage[] = thread?.messages ?? [];
  const lastIncoming = [...messages].reverse().find((m) => !m.mine);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/email?controlNo=${encodeURIComponent(doc.controlNo)}`);
      const data = (await res.json()) as EmailThread & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load the email.");
      setThread(data);
      setPicking(!data.linked);
      if (data.error) setError(data.error);
    } catch (e) {
      setError((e as Error).message);
      setThread({ linked: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.controlNo]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function search() {
    setError("");
    setCandidates(null);
    const res = await fetch(`/api/email?from=${encodeURIComponent(pickFrom.trim())}`);
    const data = await res.json().catch(() => ({ error: "Could not search." }));
    if (!res.ok || !Array.isArray(data)) { setError(data.error || "Could not search."); return; }
    setCandidates(data);
  }

  async function link(threadId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", controlNo: doc.controlNo, threadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not link.");
      setCandidates(null);
      onLinked();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const prepared = await Promise.all(Array.from(list).map(prepareFile));
    setFiles((prev) => [...prev, ...prepared]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const text = reply.trim();
    if (!text || !lastIncoming) return;
    if (totalBytes > MAX_UPLOAD_BYTES) { setError(`Attachments total ${formatBytes(totalBytes)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`); return; }
    if (!assigned && !window.confirm(`You are not assigned to ${doc.controlNo}. Send the reply anyway?`)) return;
    const to = replyAll ? "everyone on this email" : lastIncoming.from;
    if (!window.confirm(`Send this reply from ${thread?.mailbox || "peso@bataan.gov.ph"} to ${to}?`)) return;

    setBusy(true);
    setError("");
    try {
      const payloadFiles = await Promise.all(
        files.map(async (f) => ({ name: f.name, type: f.type, data: await blobToBase64(f.blob) }))
      );
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", controlNo: doc.controlNo, body: text, replyAll, files: payloadFiles }),
      });
      const data = await res.json().catch(() => ({ error: res.status === 413 ? "Attachments are too large." : `Server error (${res.status}).` }));
      if (!res.ok) throw new Error(data.error || "Could not send.");

      // Show the sent reply right away.
      setThread((t) => t && {
        ...t,
        messages: [...(t.messages ?? []), {
          id: `sent-${Date.now()}`, from: t.mailbox || "peso@bataan.gov.ph", to: lastIncoming.from, cc: "",
          date: new Date().toISOString(), subject: "Re: " + (t.subject || ""), body: text + "\n\n" + (data.signature || signature),
          attachments: files.map((f) => ({ name: f.name, size: f.blob.size })), mine: true,
        }],
      });
      setReply("");
      setFiles([]);
      onReplySent({ controlNo: data.controlNo || "", trackingNo: data.trackingNo || "", warning: data.warning });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ep-overlay" onClick={onClose}>
      <style>{EP_CSS}</style>
      <aside className="ep-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ep-head">
          <div style={{ minWidth: 0 }}>
            <div className="ep-cn">{doc.controlNo} · ✉️ Email</div>
            <div className="ep-subject">{thread?.subject || doc.description || "Email"}</div>
            <div className="ep-meta">
              {thread?.linked && thread.permalink && thread.permalink !== "#" && (
                <a href={thread.permalink} target="_blank" rel="noreferrer">Open in Gmail ↗</a>
              )}
              {thread?.linked && <button onClick={() => { setPicking((p) => !p); setCandidates(null); }}>Change email</button>}
              {!connected && <span className="ep-demo">demo — nothing is sent</span>}
            </div>
          </div>
          <button className="ep-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="ep-error">{error}</div>}

        {picking && (
          <div className="ep-pick">
            <div className="ep-label">{thread?.linked ? "Link a different email" : "This document isn't linked to an email yet"}</div>
            <div className="ep-row">
              <input placeholder="Sender's email address" value={pickFrom} onChange={(e) => setPickFrom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
              <button className="ep-btn" disabled={!pickFrom.trim()} onClick={search}>Search</button>
            </div>
            {candidates && candidates.length === 0 && <div className="ep-hint">No emails from that address.</div>}
            {candidates?.map((c) => (
              <div className="ep-cand" key={c.threadId}>
                <div style={{ minWidth: 0 }}>
                  <div className="ep-cand-subj">{c.subject || "(no subject)"}</div>
                  <div className="ep-hint">{fmtDate(c.date)} · {c.messageCount} message{c.messageCount !== 1 ? "s" : ""} — {c.snippet}</div>
                </div>
                <button className="ep-btn primary" disabled={busy} onClick={() => link(c.threadId)}>Link</button>
              </div>
            ))}
          </div>
        )}

        <div className="ep-scroll" ref={scrollRef}>
          {loading ? (
            <div className="ep-empty">Loading email…</div>
          ) : messages.length === 0 ? (
            <div className="ep-empty">No email to show.</div>
          ) : (
            messages.map((m) => (
              <div className={"ep-msg" + (m.mine ? " mine" : "")} key={m.id}>
                <div className="ep-msg-head">
                  <b>{m.mine ? "PESO (reply)" : m.from}</b>
                  <span>{fmtDate(m.date)}</span>
                </div>
                <div className="ep-msg-to">To: {m.to}{m.cc ? ` · Cc: ${m.cc}` : ""}</div>
                <div className="ep-msg-body">{m.body}</div>
                {m.attachments.length > 0 && (
                  <div className="ep-atts">
                    {m.attachments.map((a, i) => <span key={i}>📎 {a.name} ({formatBytes(a.size)})</span>)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {thread?.linked && (
          <div className="ep-compose">
            {!assigned && <div className="ep-warn">You are not one of the staff assigned to this document.</div>}
            <textarea
              placeholder={lastIncoming ? `Reply to ${lastIncoming.from}…` : "Reply…"}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              disabled={busy}
            />
            <div className="ep-sig">{signature}</div>
            {files.length > 0 && (
              <div className="ep-files">
                {files.map((f, i) => (
                  <span key={i}>
                    📎 {f.name} ({formatBytes(f.blob.size)})
                    <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={"Remove " + f.name}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="ep-actions">
              <label className="ep-check">
                <input type="checkbox" checked={replyAll} onChange={(e) => setReplyAll(e.target.checked)} /> Reply all
              </label>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
              <button className="ep-btn" disabled={busy} onClick={() => fileRef.current?.click()}>📎 Attach</button>
              <button className="ep-btn primary" disabled={busy || !reply.trim() || !lastIncoming} onClick={send}>
                {busy ? "Sending…" : "Send reply"}
              </button>
            </div>
            <div className="ep-hint">
              Sent from {thread.mailbox || "peso@bataan.gov.ph"} in the same Gmail conversation, and recorded as an Outgoing
              document linked to this one.
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

const EP_CSS = `
.ep-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(6,9,16,.6); display: flex; justify-content: flex-end; }
.ep-panel { width: 560px; max-width: 96vw; height: 100%; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,.5); }
.ep-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.ep-cn { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--accent); font-weight: 600; }
.ep-subject { font-size: 16px; font-weight: 700; margin-top: 3px; }
.ep-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px; font-size: 12px; }
.ep-meta a, .ep-meta button { color: var(--accent); background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; font-size: 12px; }
.ep-demo { color: var(--warn); font-weight: 600; }
.ep-close { background: none; border: none; color: var(--text2); font-size: 16px; cursor: pointer; }
.ep-close:hover { color: var(--text); }
.ep-error { margin: 10px 18px 0; color: var(--danger); font-size: 12px; }
.ep-pick { padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--surface2); display: flex; flex-direction: column; gap: 8px; }
.ep-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); }
.ep-row { display: flex; gap: 8px; }
.ep-row input { flex: 1; min-width: 0; padding: 8px 11px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 13px; }
.ep-cand { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.ep-cand-subj { font-size: 13px; font-weight: 600; }
.ep-hint { font-size: 11px; color: var(--text3); line-height: 1.45; }
.ep-scroll { flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.ep-empty { color: var(--text3); font-size: 13px; text-align: center; margin: auto; }
.ep-msg { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.ep-msg.mine { background: rgba(79,142,247,.1); border-color: rgba(79,142,247,.3); margin-left: 24px; }
.ep-msg-head { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.ep-msg-head b { color: var(--text); word-break: break-all; }
.ep-msg-head span { color: var(--text3); white-space: nowrap; font-size: 11px; }
.ep-msg-to { font-size: 11px; color: var(--text3); margin-top: 2px; word-break: break-all; }
.ep-msg-body { margin-top: 8px; font-size: 13px; color: var(--text); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.ep-atts, .ep-files { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; font-size: 11px; color: var(--text2); }
.ep-files button { background: none; border: none; color: var(--text3); cursor: pointer; margin-left: 4px; }
.ep-compose { border-top: 1px solid var(--border); padding: 12px 18px 14px; display: flex; flex-direction: column; gap: 8px; }
.ep-warn { font-size: 11px; color: var(--warn); }
.ep-compose textarea { min-height: 110px; max-height: 260px; resize: vertical; padding: 10px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 13px; line-height: 1.5; }
.ep-compose textarea:focus { outline: none; border-color: var(--accent); }
.ep-sig { font-size: 12px; color: var(--text2); white-space: pre-line; padding-left: 2px; }
.ep-actions { display: flex; align-items: center; gap: 8px; }
.ep-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); margin-right: auto; cursor: pointer; }
.ep-btn { padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; background: transparent; color: var(--text2); border: 1px solid var(--border); }
.ep-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text3); }
.ep-btn:disabled { opacity: .5; cursor: not-allowed; }
.ep-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
`;
