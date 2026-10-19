"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicStaff } from "@/lib/staff";
import { MAX_UPLOAD_BYTES, blobToBase64, formatBytes, prepareFile } from "@/lib/image";
import type { ChatMessage } from "@/lib/chat";
import type { MovItem } from "@/lib/mov";

const IDENTITY_KEY = "oppesm_task_identity";

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TaskThread({
  controlNo,
  title,
  staff,
  connected,
  initialTab,
  onClose,
}: {
  controlNo: string;
  title: string;
  staff: PublicStaff[];
  connected: boolean;
  initialTab: "chat" | "mov";
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"chat" | "mov">(initialTab);
  const [identity, setIdentity] = useState<string>("");
  const [pickName, setPickName] = useState<string>("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [movItems, setMovItems] = useState<MovItem[]>([]);
  const [movNote, setMovNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load remembered identity.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(IDENTITY_KEY);
      if (saved) setIdentity(saved);
    } catch {}
  }, []);

  // Load chat + MOV for this task.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/chat?controlNo=${encodeURIComponent(controlNo)}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/mov?controlNo=${encodeURIComponent(controlNo)}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([c, m]) => {
        if (!alive) return;
        setMessages(Array.isArray(c) ? c : []);
        setMovItems(Array.isArray(m) ? m : []);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [controlNo]);

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    if (tab === "chat" && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, tab, loading]);

  function saveIdentity() {
    if (!pickName) return;
    setIdentity(pickName);
    try { localStorage.setItem(IDENTITY_KEY, pickName); } catch {}
  }
  function changeIdentity() {
    setPickName(identity);
    setIdentity("");
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!message || !identity) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlNo, author: identity, message }),
      });
      const data = await res.json();
      if (data.item) {
        setMessages((prev) => [...prev, data.item]);
        setDraft("");
      } else {
        setError(data.error || "Could not post.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadMov(file: File) {
    if (!identity) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareFile(file);
      if (prepared.blob.size > MAX_UPLOAD_BYTES) {
        setError(`File is ${formatBytes(prepared.blob.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const data = await blobToBase64(prepared.blob);
      const res = await fetch("/api/mov", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlNo,
          uploadedBy: identity,
          note: movNote.trim(),
          file: { name: prepared.name, type: prepared.type, data },
        }),
      });
      const result = await res.json().catch(() => ({
        error: res.status === 413 ? "File is too large to upload." : `Server error (${res.status}).`,
      }));
      if (result.item) {
        setMovItems((prev) => [result.item, ...prev]);
        setMovNote("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setError(result.error || "Could not upload.");
      }
    } catch {
      setError("Could not upload the file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tt-overlay" onClick={onClose}>
      <style>{TT_CSS}</style>
      <aside className="tt-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tt-head">
          <div>
            <div className="tt-cn">{controlNo}</div>
            <div className="tt-title">{title}</div>
          </div>
          <button className="tt-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="tt-idbar">
          {identity ? (
            <span>You are: <b>{identity}</b> <button onClick={changeIdentity}>change</button></span>
          ) : (
            <span className="tt-idpick">
              <select value={pickName} onChange={(e) => setPickName(e.target.value)}>
                <option value="">Select your name…</option>
                {staff.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <button className="tt-idsave" disabled={!pickName} onClick={saveIdentity}>Set</button>
            </span>
          )}
          {!connected && <span className="tt-demo">demo — not saved</span>}
        </div>

        <div className="tt-tabs">
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>💬 Chat</button>
          <button className={tab === "mov" ? "active" : ""} onClick={() => setTab("mov")}>📎 MOV ({movItems.length})</button>
        </div>

        {error && <div className="tt-error">{error}</div>}

        {tab === "chat" ? (
          <>
            <div className="tt-scroll" ref={scrollRef}>
              {loading ? (
                <div className="tt-empty">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="tt-empty">No messages yet. Start the conversation.</div>
              ) : (
                messages.map((m) => (
                  <div className={"tt-msg" + (m.author === identity ? " mine" : "")} key={m.id}>
                    <div className="tt-msg-head"><b>{m.author}</b><span>{fmtStamp(m.createdAt)}</span></div>
                    <div className="tt-msg-body">{m.message}</div>
                  </div>
                ))
              )}
            </div>
            <div className="tt-compose">
              <textarea
                placeholder={identity ? "Write a message…" : "Pick your name above to chat"}
                value={draft}
                disabled={!identity || busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button className="tt-send" disabled={!identity || busy || !draft.trim()} onClick={sendMessage}>Send</button>
            </div>
          </>
        ) : (
          <>
            <div className="tt-scroll">
              {loading ? (
                <div className="tt-empty">Loading…</div>
              ) : movItems.length === 0 ? (
                <div className="tt-empty">No verification files yet. Upload proof of progress below.</div>
              ) : (
                movItems.map((m) => (
                  <div className="tt-mov" key={m.id}>
                    <div className="tt-mov-ico">📄</div>
                    <div className="tt-mov-main">
                      {m.fileUrl && m.fileUrl !== "#" ? (
                        <a className="tt-mov-name" href={m.fileUrl} target="_blank" rel="noreferrer">{m.fileName}</a>
                      ) : (
                        <span className="tt-mov-name">{m.fileName}</span>
                      )}
                      {m.note && <div className="tt-mov-note">{m.note}</div>}
                      <div className="tt-mov-meta">{m.uploadedBy} · {fmtStamp(m.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="tt-compose tt-mov-upload">
              <input
                className="tt-mov-notein"
                placeholder="Optional note (what this proves)…"
                value={movNote}
                disabled={!identity || busy}
                onChange={(e) => setMovNote(e.target.value)}
              />
              <input
                ref={fileRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMov(f); }}
              />
              <button className="tt-send" disabled={!identity || busy} onClick={() => fileRef.current?.click()}>
                {busy ? "Uploading…" : "＋ Attach MOV"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

const TT_CSS = `
.tt-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(6,9,16,.6); display: flex; justify-content: flex-end; }
.tt-panel { width: 440px; max-width: 92vw; height: 100%; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,.5); }
.tt-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.tt-cn { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--accent); font-weight: 600; }
.tt-title { font-size: 15px; font-weight: 700; margin-top: 3px; }
.tt-close { background: none; border: none; color: var(--text2); font-size: 16px; cursor: pointer; }
.tt-close:hover { color: var(--text); }
.tt-idbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 18px; font-size: 12px; color: var(--text2); border-bottom: 1px solid var(--border); background: var(--surface2); }
.tt-idbar b { color: var(--text); }
.tt-idbar button { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 12px; padding: 0; text-decoration: underline; }
.tt-idpick { display: flex; align-items: center; gap: 6px; }
.tt-idpick select { padding: 5px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 12px; font-family: inherit; }
.tt-idsave { background: var(--accent) !important; color: #fff !important; border-radius: 6px !important; padding: 5px 12px !important; text-decoration: none !important; font-weight: 600; }
.tt-idsave:disabled { opacity: .5; cursor: not-allowed; }
.tt-demo { margin-left: auto; color: var(--warn); font-weight: 600; }
.tt-tabs { display: flex; gap: 4px; padding: 10px 14px 0; }
.tt-tabs button { flex: 1; padding: 8px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text2); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.tt-tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
.tt-error { margin: 8px 18px 0; color: var(--danger); font-size: 12px; }
.tt-scroll { flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.tt-empty { color: var(--text3); font-size: 13px; text-align: center; margin: auto; }
.tt-msg { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; max-width: 88%; align-self: flex-start; }
.tt-msg.mine { align-self: flex-end; background: rgba(79,142,247,.12); border-color: rgba(79,142,247,.3); }
.tt-msg-head { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: var(--text2); margin-bottom: 3px; }
.tt-msg-head b { color: var(--text); font-size: 12px; }
.tt-msg-body { font-size: 13px; color: var(--text); line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.tt-compose { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); align-items: flex-end; }
.tt-compose textarea { flex: 1; resize: none; min-height: 40px; max-height: 120px; padding: 9px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 13px; }
.tt-compose textarea:focus { outline: none; border-color: var(--accent); }
.tt-send { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.tt-send:disabled { opacity: .5; cursor: not-allowed; }
.tt-mov { display: flex; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.tt-mov-ico { font-size: 20px; }
.tt-mov-main { min-width: 0; }
.tt-mov-name { font-size: 13px; font-weight: 600; color: var(--accent); word-break: break-all; }
.tt-mov-note { font-size: 12px; color: var(--text2); margin-top: 2px; line-height: 1.4; }
.tt-mov-meta { font-size: 10px; color: var(--text3); margin-top: 4px; }
.tt-mov-upload { flex-direction: column; align-items: stretch; gap: 8px; }
.tt-mov-notein { padding: 9px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 13px; }
.tt-mov-notein:focus { outline: none; border-color: var(--accent); }
`;
