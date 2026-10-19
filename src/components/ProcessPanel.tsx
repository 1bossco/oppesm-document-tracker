"use client";

import { useState } from "react";
import type { TrackedDocument } from "@/lib/documents";
import {
  buildTimeline,
  eventTime,
  formatSpan,
  formatWhen,
  type Process,
  type ProcessNote,
  type ProcessStatus,
} from "@/lib/timeline";

// Side panel showing one tracked process from start to finish: every IN/OUT
// movement and note in time order, the gaps between them, and actions to add
// notes, link more documents, and complete / cancel / reopen.
export function ProcessPanel({
  process,
  docs,
  notes,
  officeSuggestions,
  connected,
  onClose,
  onAddNote,
  onSetStatus,
  onUnlink,
  onLink,
}: {
  process: Process;
  docs: TrackedDocument[];
  notes: ProcessNote[];
  officeSuggestions: string[];
  connected: boolean;
  onClose: () => void;
  onAddNote: (office: string, note: string) => Promise<boolean>;
  onSetStatus: (status: ProcessStatus) => void;
  onUnlink: (controlNo: string) => void;
  onLink: (controlNo: string) => void;
}) {
  const [office, setOffice] = useState("");
  const [note, setNote] = useState("");
  const [linkNo, setLinkNo] = useState("");
  const [busy, setBusy] = useState(false);

  const events = buildTimeline(docs, notes);
  const now = Date.now();
  const first = events[0]?.time || eventTime(process.createdAt);
  const last = events[events.length - 1];
  const end = process.status === "Open" ? now : eventTime(process.closedAt) || last?.time || now;
  const isOpen = process.status === "Open";

  async function submitNote() {
    if (!office.trim() && !note.trim()) return;
    setBusy(true);
    const ok = await onAddNote(office.trim(), note.trim());
    setBusy(false);
    if (ok) { setOffice(""); setNote(""); }
  }

  function submitLink() {
    const v = linkNo.trim().toUpperCase();
    if (!v) return;
    onLink(v);
    setLinkNo("");
  }

  return (
    <div className="pp-overlay" onClick={onClose}>
      <style>{PP_CSS}</style>
      <aside className="pp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pp-head">
          <div>
            <div className="pp-tn">{process.trackingNo}</div>
            <div className="pp-subject">{process.subject || "Untitled process"}</div>
            <div className="pp-meta">
              <span className={"pp-status " + process.status.toLowerCase()}>{process.status}</span>
              <span>Started {formatWhen(first)}</span>
              <span>· {formatSpan(end - first)}{isOpen ? " so far" : " total"}</span>
            </div>
          </div>
          <button className="pp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pp-scroll">
          {events.map((ev, i) => {
            const prev = events[i - 1];
            const gap = prev ? ev.time - prev.time : 0;
            return (
              <div key={ev.kind === "NOTE" ? ev.note.id : ev.doc.controlNo}>
                {prev && (
                  <div className="pp-gap">
                    {formatSpan(gap)}
                    {prev.kind === "OUT" && ev.kind === "IN" ? " at the other office" : " later"}
                  </div>
                )}
                <div className={"pp-ev " + ev.kind.toLowerCase()}>
                  <div className="pp-dot" />
                  <div className="pp-card">
                    <div className="pp-when">
                      <span className={"pp-kind " + ev.kind.toLowerCase()}>
                        {ev.kind === "IN" ? "↘ IN" : ev.kind === "OUT" ? "↗ OUT" : "📝 NOTE"}
                      </span>
                      {formatWhen(ev.time)}
                    </div>
                    {ev.kind === "NOTE" ? (
                      <>
                        {ev.note.office && <div className="pp-office">{ev.note.office}</div>}
                        {ev.note.note && <div className="pp-text">{ev.note.note}</div>}
                        <div className="pp-by">{ev.note.by}</div>
                      </>
                    ) : (
                      <>
                        <div className="pp-doc">
                          <span className="pp-cn">{ev.doc.controlNo}</span> {ev.doc.title}
                        </div>
                        {ev.doc.description && <div className="pp-text">{ev.doc.description}</div>}
                        <div className="pp-by">
                          {ev.doc.staff || "—"} · {ev.doc.progress || "—"}
                          {ev.doc.printStatus ? ` · ${ev.doc.printStatus}` : ""}
                        </div>
                        <div className="pp-doc-actions">
                          {ev.doc.fileUrl && ev.doc.fileUrl !== "#" && (
                            <a href={ev.doc.fileUrl} target="_blank" rel="noreferrer">View file</a>
                          )}
                          <button onClick={() => onUnlink(ev.doc.controlNo)}>Remove from process</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isOpen && last && (
            <div className="pp-ev pending">
              <div className="pp-dot" />
              <div className="pp-pending">
                {formatSpan(now - last.time)} since the last step
                {last.kind === "OUT" ? " — waiting for the paper to come back" : ""}
              </div>
            </div>
          )}
          {!isOpen && (
            <div className="pp-ev closed">
              <div className="pp-dot" />
              <div className="pp-pending">
                {process.status} {process.closedAt ? formatWhen(eventTime(process.closedAt)) : ""}
              </div>
            </div>
          )}
        </div>

        <div className="pp-foot">
          <div className="pp-label">Add a step <span>(time is recorded automatically)</span></div>
          <div className="pp-row">
            <input
              list="pp-offices"
              placeholder="Office (e.g. Accounting)"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              disabled={busy}
            />
            <datalist id="pp-offices">
              {officeSuggestions.map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
          <div className="pp-row">
            <input
              placeholder="Note (e.g. PR prepared, ObR signed)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNote(); }}
              disabled={busy}
            />
            <button className="pp-btn primary" disabled={busy || (!office.trim() && !note.trim())} onClick={submitNote}>
              {busy ? "Saving…" : "Add"}
            </button>
          </div>

          <div className="pp-label">Link another document</div>
          <div className="pp-row">
            <input
              className="mono"
              placeholder="Control no. (e.g. IN-261005-001)"
              value={linkNo}
              onChange={(e) => setLinkNo(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") submitLink(); }}
            />
            <button className="pp-btn" disabled={!linkNo.trim()} onClick={submitLink}>Link</button>
          </div>

          <div className="pp-status-actions">
            {isOpen ? (
              <>
                <button className="pp-btn success" onClick={() => onSetStatus("Completed")}>✓ Mark complete</button>
                <button className="pp-btn danger" onClick={() => onSetStatus("Cancelled")}>Cancel process</button>
              </>
            ) : (
              <button className="pp-btn" onClick={() => onSetStatus("Open")}>↺ Reopen</button>
            )}
            {!connected && <span className="pp-demo">demo — not saved</span>}
          </div>
        </div>
      </aside>
    </div>
  );
}

const PP_CSS = `
.pp-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(6,9,16,.6); display: flex; justify-content: flex-end; }
.pp-panel { width: 500px; max-width: 94vw; height: 100%; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,.5); }
.pp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.pp-tn { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--purple); font-weight: 600; }
.pp-subject { font-size: 16px; font-weight: 700; margin-top: 3px; }
.pp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: var(--text2); margin-top: 6px; }
.pp-status { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.pp-status.open { background: rgba(79,142,247,.15); color: var(--accent); }
.pp-status.completed { background: rgba(110,231,183,.15); color: var(--accent2); }
.pp-status.cancelled { background: rgba(136,145,179,.15); color: var(--text2); }
.pp-close { background: none; border: none; color: var(--text2); font-size: 16px; cursor: pointer; }
.pp-close:hover { color: var(--text); }
.pp-scroll { flex: 1; overflow-y: auto; padding: 16px 18px 8px; }
.pp-ev { position: relative; display: flex; gap: 12px; }
.pp-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 12px; flex-shrink: 0; background: var(--text3); box-shadow: 0 0 0 3px var(--surface); }
.pp-ev.in .pp-dot { background: var(--accent); }
.pp-ev.out .pp-dot { background: var(--purple); }
.pp-ev.note .pp-dot { background: var(--warn); }
.pp-ev.pending .pp-dot { background: transparent; border: 2px dashed var(--text3); }
.pp-ev.closed .pp-dot { background: var(--accent2); }
.pp-card { flex: 1; min-width: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.pp-when { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text2); }
.pp-kind { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 20px; }
.pp-kind.in { background: rgba(79,142,247,.15); color: var(--accent); }
.pp-kind.out { background: rgba(167,139,250,.15); color: var(--purple); }
.pp-kind.note { background: rgba(251,191,36,.15); color: var(--warn); }
.pp-doc { font-size: 13px; font-weight: 600; margin-top: 6px; }
.pp-cn { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--accent); margin-right: 4px; }
.pp-office { font-size: 13px; font-weight: 700; margin-top: 6px; }
.pp-text { font-size: 12px; color: var(--text2); margin-top: 3px; line-height: 1.45; white-space: pre-wrap; }
.pp-by { font-size: 10px; color: var(--text3); margin-top: 5px; }
.pp-doc-actions { display: flex; gap: 12px; margin-top: 6px; }
.pp-doc-actions a, .pp-doc-actions button { background: none; border: none; padding: 0; font-size: 11px; color: var(--accent); cursor: pointer; font-family: inherit; }
.pp-doc-actions button { color: var(--text3); }
.pp-doc-actions button:hover { color: var(--danger); }
.pp-gap { margin: 4px 0 4px 5px; padding: 6px 0 6px 18px; border-left: 2px dashed var(--border); font-size: 11px; color: var(--text3); font-style: italic; }
.pp-pending { margin-top: 8px; font-size: 12px; color: var(--text2); font-style: italic; }
.pp-foot { border-top: 1px solid var(--border); padding: 12px 18px 16px; display: flex; flex-direction: column; gap: 8px; }
.pp-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); margin-top: 4px; }
.pp-label span { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text3); }
.pp-row { display: flex; gap: 8px; }
.pp-row input { flex: 1; min-width: 0; padding: 8px 11px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; font-size: 13px; }
.pp-row input.mono { font-family: "IBM Plex Mono", monospace; }
.pp-row input:focus { outline: none; border-color: var(--accent); }
.pp-btn { padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; background: transparent; color: var(--text2); border: 1px solid var(--border); }
.pp-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text3); }
.pp-btn:disabled { opacity: .5; cursor: not-allowed; }
.pp-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.pp-btn.success { background: rgba(110,231,183,.15); color: var(--accent2); border-color: rgba(110,231,183,.3); }
.pp-btn.danger { background: rgba(248,113,113,.12); color: var(--danger); border-color: rgba(248,113,113,.3); }
.pp-status-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border); }
.pp-demo { margin-left: auto; font-size: 11px; color: var(--warn); font-weight: 600; }
`;
