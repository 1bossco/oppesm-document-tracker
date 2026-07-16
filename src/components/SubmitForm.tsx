"use client";

import { useEffect, useRef, useState } from "react";
import type { TitleOption } from "@/lib/titles";
import type { StaffMember } from "@/lib/staff";

interface PreparedFile {
  name: string;
  type: string;
  blob: Blob;
}

export function SubmitForm({
  initialTitles,
  initialStaff,
  connected,
}: {
  initialTitles: TitleOption[];
  initialStaff: StaffMember[];
  connected: boolean;
}) {
  const [titles] = useState<TitleOption[]>(initialTitles);
  const [staffDirectory] = useState<StaffMember[]>(initialStaff);
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffOpen, setStaffOpen] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [processingTime, setProcessingTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [previews, setPreviews] = useState<{ kind: "img" | "file"; url?: string; name: string; ext: string; ico: string }[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [controlNo, setControlNo] = useState("");
  const [dragover, setDragover] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string; error?: boolean } | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const isIncoming = docType === "Incoming Docs";
  const isTask = docType === "New Task";
  const showCalendar = isIncoming || isTask;

  function toggleStaff(member: StaffMember) {
    setSelectedStaff((prev) =>
      prev.some((s) => s.name === member.name)
        ? prev.filter((s) => s.name !== member.name)
        : [...prev, member]
    );
  }
  const filteredStaff = staffDirectory.filter((s) => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.position.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function onTitleChange(value: string) {
    setTitle(value);
    const found = titles.find((x) => x.title === value);
    setProcessingTime(found ? found.processingTime : "");
  }

  async function handleFileSelection(rawFiles: File[]) {
    if (!rawFiles.length) return;
    setStatus(`Processing ${rawFiles.length} file(s)…`);

    const nextFiles: PreparedFile[] = [];
    const nextPreviews: typeof previews = [];

    for (const file of rawFiles) {
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        try {
          const corrected = await correctImageOrientation(file);
          nextFiles.push(corrected);
          nextPreviews.push({ kind: "img", url: URL.createObjectURL(corrected.blob), name: corrected.name, ext: "", ico: "" });
        } catch {
          nextFiles.push({ name: file.name, type: file.type, blob: file });
          nextPreviews.push(makeFileMeta(file));
        }
      } else {
        nextFiles.push({ name: file.name, type: file.type, blob: file });
        nextPreviews.push(makeFileMeta(file));
      }
    }

    setFiles((prev) => [...prev, ...nextFiles]);
    setPreviews((prev) => [...prev, ...nextPreviews]);
    setStatus("");
  }

  async function handleSubmit() {
    if (!docType || !title || !description) {
      setToast({ title: "Missing Fields", body: "Please fill in all required fields.", error: true });
      return;
    }
    // Files are required for documents, optional for tasks.
    if (!isTask && files.length === 0) {
      setToast({ title: "Missing Fields", body: "Please attach at least one file.", error: true });
      return;
    }

    setBusy(true);
    setStatus("Preparing files…");
    setControlNo("");

    const payloadFiles: { name: string; type: string; data: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Preparing file ${i + 1} of ${files.length}…`);
      const cf = files[i];
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(new Error("Read failed"));
        r.readAsDataURL(cf.blob);
      });
      payloadFiles.push({ name: cf.name, type: cf.type, data: base64 });
    }

    setStatus("Uploading to server…");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          title,
          description,
          staff: selectedStaff.map((s) => ({ name: s.name, email: s.email })),
          addToCalendar: showCalendar && addToCalendar,
          processingTime,
          dueDate: isTask ? dueDate : "",
          files: payloadFiles,
        }),
      });
      const result = await res.json();
      setStatus("");
      if (result.success) {
        setControlNo(result.controlNo);
        const extras: string[] = [];
        if (selectedStaff.length) extras.push(`${selectedStaff.length} staff notified`);
        if (showCalendar && addToCalendar) extras.push("added to calendar");
        const suffix = extras.length ? " · " + extras.join(" · ") : "";
        setToast({
          title: "Document Submitted ✓",
          body: (result.demo ? "Demo (not saved). " : "") + "Control No: " + result.controlNo + suffix,
        });
        resetForm();
      } else {
        setToast({ title: "Error", body: result.error || "Something went wrong.", error: true });
      }
    } catch (err) {
      setStatus("");
      setToast({ title: "Error", body: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setDocType("");
    setTitle("");
    setDescription("");
    setSelectedStaff([]);
    setStaffSearch("");
    setStaffOpen(false);
    setAddToCalendar(false);
    setProcessingTime("");
    setDueDate("");
    setFiles([]);
    setPreviews([]);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  return (
    <div className="submit-scope">
      <style>{FORM_CSS}</style>

      <div className="card">
        {controlNo && (
          <div className="control-no-badge show">
            <span>&#10003;</span>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.7, marginBottom: 2 }}>
                Document Submitted
              </div>
              <div className="cn">{controlNo}</div>
            </div>
          </div>
        )}

        {busy && <div className="progress-bar show" />}
        {status && <div className="process-status show">{status}</div>}

        <div className="form-row">
          <div className="form-group">
            <label>Document Type <span className="required">*</span></label>
            <select
              value={docType}
              onChange={(e) => {
                const v = e.target.value;
                setDocType(v);
                // Calendar option applies to Incoming Docs and Tasks only.
                if (v !== "Incoming Docs" && v !== "New Task") setAddToCalendar(false);
                // Switching type resets the title (dropdown vs free-text differ).
                setTitle("");
                setProcessingTime("");
              }}
              required
            >
              <option value="">Select type</option>
              <option>Incoming Docs</option>
              <option>Outgoing Docs</option>
              <option>New Task</option>
            </select>
          </div>
          <div className="form-group">
            <label>{isTask ? "Due Date" : "Processing Time"}</label>
            {isTask ? (
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="date-input" />
            ) : (
              <input type="text" value={processingTime} readOnly placeholder="Auto-filled" />
            )}
          </div>
        </div>

        <div className="form-group">
          <label>{isTask ? "Task Title" : "Title of Document"} <span className="required">*</span></label>
          {isTask ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter the task title…"
              required
            />
          ) : (
            <select value={title} onChange={(e) => onTitleChange(e.target.value)} required>
              <option value="">Select title</option>
              {titles.map((t) => (
                <option key={t.title} value={t.title}>{t.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group">
          <label>{isTask ? "Task Description" : "Document Description"} <span className="required">*</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder={isTask ? "Describe the task, what needs to be done, and any details…" : "Enter document details, references, and purpose..."}
          />
        </div>

        <div className="form-group">
          <label>PESO Staff Assigned</label>
          <div className="staff-select">
            <div className="staff-control" onClick={() => setStaffOpen((o) => !o)}>
              {selectedStaff.length === 0 ? (
                <span className="staff-ph">Select staff to notify (optional)</span>
              ) : (
                <div className="staff-chips">
                  {selectedStaff.map((s) => (
                    <span className="staff-chip" key={s.name}>
                      {s.name}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleStaff(s); }}
                        aria-label={"Remove " + s.name}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <span className="staff-caret">{staffOpen ? "▲" : "▼"}</span>
            </div>
            {staffOpen && (
              <div className="staff-panel">
                <input
                  className="staff-search"
                  placeholder="Search name or position…"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  autoFocus
                />
                <div className="staff-list">
                  {filteredStaff.map((s) => {
                    const checked = selectedStaff.some((x) => x.name === s.name);
                    return (
                      <label className={"staff-item" + (checked ? " checked" : "")} key={s.name}>
                        <input type="checkbox" checked={checked} onChange={() => toggleStaff(s)} />
                        <span className="si-main">
                          <span className="si-name">{s.name}</span>
                          <span className="si-sub">{s.position}{s.email ? " · " + s.email : " · no email"}</span>
                        </span>
                      </label>
                    );
                  })}
                  {filteredStaff.length === 0 && <div className="staff-empty">No staff match.</div>}
                </div>
                <div className="staff-foot">
                  <span>{selectedStaff.length} selected</span>
                  <button type="button" onClick={() => setStaffOpen(false)}>Done</button>
                </div>
              </div>
            )}
          </div>
          {selectedStaff.length > 0 && (
            <div className="staff-note">
              📧 {selectedStaff.filter((s) => s.email).length} of {selectedStaff.length} will be emailed
              {selectedStaff.some((s) => !s.email) && " (some have no email on file)"}
              {!connected && " — demo mode, nothing is actually sent"}.
            </div>
          )}
        </div>

        {showCalendar && (
          <div className="form-group">
            <label className="cal-check">
              <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} />
              <span className="cal-box" aria-hidden />
              <span className="cal-text">
                🗓️ Note this {isTask ? "task" : "document"} to the PESO calendar
                <small>Adds a deadline reminder to peso@bataan.gov.ph and invites the assigned staff.</small>
              </span>
            </label>
          </div>
        )}

        <div className="form-group">
          <label>Attach Files {isTask ? <span className="optional">(optional)</span> : <span className="required">*</span>}</label>
          <div
            className={"upload-section" + (dragover ? " dragover" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={(e) => { e.preventDefault(); setDragover(false); handleFileSelection(Array.from(e.dataTransfer.files)); }}
          >
            <div className="upload-buttons">
              <label className="upload-btn" title="Take photo with camera">
                <div className="ub-ico">&#128247;</div>
                <div className="ub-title">Take Photo</div>
                <div className="ub-sub">Use camera to<br />capture document</div>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple
                  onChange={(e) => handleFileSelection(Array.from(e.target.files ?? []))} />
              </label>
              <label className="upload-btn" title="Choose from gallery or files">
                <div className="ub-ico">&#128193;</div>
                <div className="ub-title">Choose File</div>
                <div className="ub-sub">Gallery, PDF,<br />DOCX, XLSX&hellip;</div>
                <input ref={galleryRef} type="file" accept="*/*" multiple
                  onChange={(e) => handleFileSelection(Array.from(e.target.files ?? []))} />
              </label>
            </div>
            {files.length > 0 && (
              <div className="file-count show">
                {files.length} file{files.length !== 1 ? "s" : ""} ready
              </div>
            )}
            {previews.length > 0 && (
              <div className="preview-grid show">
                {previews.map((p, i) =>
                  p.kind === "img" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} className="preview-thumb" src={p.url} alt={p.name} />
                  ) : (
                    <div key={i} className="preview-file">
                      <div className="pf-ico">{p.ico}</div>
                      <div className="pf-ext">{p.ext}</div>
                      <div className="pf-name">{p.name}</div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <button className="btn-submit" disabled={busy} onClick={handleSubmit}>
          {busy ? "Uploading…" : "Submit Document"}
        </button>
      </div>

      {toast && (
        <div className={"toast show" + (toast.error ? " error" : "")}>
          <div className="t-title">{toast.title}</div>
          <div className="t-body">{toast.body}</div>
        </div>
      )}
    </div>
  );
}

// ── Helpers (ported from the original tracker) ──────────────────────────────

function makeFileMeta(file: File) {
  const ext = (file.name.split(".").pop() || "file").toUpperCase().slice(0, 5);
  return { kind: "file" as const, name: file.name, ext, ico: getFileIcon(file.type, ext) };
}

function getFileIcon(mimeType: string, ext: string) {
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.includes("word") || ext === "DOC" || ext === "DOCX") return "📝";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet") || ext === "XLS" || ext === "XLSX" || ext === "CSV") return "📊";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation") || ext === "PPT" || ext === "PPTX") return "📋";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "🗜";
  if (mimeType.startsWith("text/")) return "📃";
  return "📎";
}

async function correctImageOrientation(file: File): Promise<PreparedFile> {
  const orientation = await getExifOrientation(file);
  const imgEl = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const w = imgEl.naturalWidth;
  const h = imgEl.naturalHeight;
  if (orientation >= 5 && orientation <= 8) { canvas.width = h; canvas.height = w; }
  else { canvas.width = w; canvas.height = h; }
  applyExifTransform(ctx, orientation, w, h);
  ctx.drawImage(imgEl, 0, 0);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return { name: baseName + ".jpg", type: "image/jpeg", blob };
}

function getExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target!.result as ArrayBuffer);
        if (view.getUint16(0, false) !== 0xffd8) return resolve(1);
        let offset = 2;
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset, false); offset += 2;
          if (marker === 0xffe1) {
            if (view.getUint32((offset += 2), false) !== 0x45786966) return resolve(1);
            const little = view.getUint16((offset += 6), false) === 0x4949;
            offset += view.getUint32(offset + 4, little);
            const tags = view.getUint16(offset, little); offset += 2;
            for (let i = 0; i < tags; i++) {
              if (view.getUint16(offset + i * 12, little) === 0x0112) {
                return resolve(view.getUint16(offset + i * 12 + 8, little));
              }
            }
          } else if ((marker & 0xff00) !== 0xff00) { break; }
          else { offset += view.getUint16(offset, false); }
        }
        resolve(1);
      } catch { resolve(1); }
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function applyExifTransform(ctx: CanvasRenderingContext2D, orientation: number, w: number, h: number) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
  }
}

const FORM_CSS = `
.submit-scope .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(79,142,247,0.08); }
.submit-scope .form-group { margin-bottom: 20px; }
.submit-scope .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.submit-scope label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text2); margin-bottom: 8px; }
.submit-scope label .required { color: var(--accent); margin-left: 2px; }
.submit-scope label .optional { color: var(--text3); margin-left: 4px; font-weight: 400; text-transform: none; letter-spacing: 0; }
.submit-scope input[type="date"].date-input { width: 100%; padding: 10px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-family: inherit; font-size: 14px; cursor: pointer; }
.submit-scope input[type="date"].date-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,142,247,0.15); }
.submit-scope input[type="date"].date-input::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }
.submit-scope select, .submit-scope textarea, .submit-scope input[type="text"] { width: 100%; padding: 11px 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-family: inherit; font-size: 14px; transition: border-color .2s, box-shadow .2s; appearance: none; }
.submit-scope select { cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238891b3' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
.submit-scope select:focus, .submit-scope textarea:focus, .submit-scope input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,142,247,0.15); }
.submit-scope input[readonly] { color: var(--accent); font-family: "IBM Plex Mono", monospace; font-weight: 600; cursor: default; border-color: rgba(79,142,247,0.3); background: rgba(79,142,247,0.05); }
.submit-scope textarea { resize: vertical; min-height: 90px; }
.submit-scope .upload-section { border: 2px dashed var(--border); border-radius: var(--radius); overflow: hidden; transition: border-color .2s; }
.submit-scope .upload-section.dragover { border-color: var(--accent); background: rgba(79,142,247,0.04); }
.submit-scope .upload-buttons { display: grid; grid-template-columns: 1fr 1fr; }
.submit-scope .upload-btn { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 20px 12px; cursor: pointer; transition: background .2s; border: none; background: none; }
.submit-scope .upload-btn:first-child { border-right: 1px solid var(--border); }
.submit-scope .upload-btn:hover { background: rgba(79,142,247,0.06); }
.submit-scope .upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; font-size: 0; }
.submit-scope .upload-btn .ub-ico { font-size: 26px; line-height: 1; }
.submit-scope .upload-btn .ub-title { font-size: 12px; font-weight: 700; color: var(--text); }
.submit-scope .upload-btn .ub-sub { font-size: 10px; color: var(--text2); text-align: center; line-height: 1.4; }
.submit-scope .file-count { padding: 8px 14px; font-size: 12px; font-family: "IBM Plex Mono", monospace; color: var(--accent2); border-top: 1px solid var(--border); background: rgba(110,231,183,0.04); }
.submit-scope .preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); }
.submit-scope .preview-thumb { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); }
.submit-scope .preview-file { width: 100%; aspect-ratio: 1; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px; overflow: hidden; }
.submit-scope .preview-file .pf-ico { font-size: 22px; line-height: 1; }
.submit-scope .preview-file .pf-ext { font-size: 9px; font-weight: 700; text-transform: uppercase; color: var(--accent); font-family: "IBM Plex Mono", monospace; letter-spacing: .5px; }
.submit-scope .preview-file .pf-name { font-size: 8px; color: var(--text2); text-align: center; word-break: break-all; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
.submit-scope .btn-submit { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--accent), #6366f1); border: none; border-radius: var(--radius); color: #fff; font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: .5px; cursor: pointer; transition: opacity .2s, transform .1s; margin-top: 8px; }
.submit-scope .btn-submit:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.submit-scope .btn-submit:disabled { opacity: .4; cursor: not-allowed; }
.submit-scope .control-no-badge { display: flex; align-items: center; gap: 10px; background: rgba(110,231,183,0.1); border: 1px solid rgba(110,231,183,0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: var(--accent2); }
.submit-scope .control-no-badge .cn { font-family: "IBM Plex Mono", monospace; font-weight: 700; font-size: 15px; }
.submit-scope .progress-bar { height: 3px; background: var(--border); border-radius: 2px; margin-bottom: 20px; overflow: hidden; }
.submit-scope .progress-bar::after { content: ''; display: block; height: 100%; width: 30%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 2px; animation: oppesm-progress 1.4s ease-in-out infinite; }
@keyframes oppesm-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(430%); } }
.submit-scope .process-status { font-size: 11px; color: var(--accent2); text-align: center; margin-bottom: 8px; font-family: "IBM Plex Mono", monospace; }
.toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent2); border-radius: 10px; padding: 14px 20px; font-size: 14px; color: var(--text); box-shadow: 0 8px 24px rgba(0,0,0,0.4); transform: translateX(120%); transition: transform .3s cubic-bezier(0.16,1,0.3,1); z-index: 999; max-width: 320px; }
.toast.show { transform: translateX(0); }
.toast.error { border-left-color: var(--danger); }
.toast .t-title { font-weight: 700; margin-bottom: 4px; }
.toast .t-body { color: var(--text2); font-size: 12px; }
/* Staff multi-select */
.submit-scope .staff-select { position: relative; }
.submit-scope .staff-control { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
.submit-scope .staff-control:hover { border-color: var(--text3); }
.submit-scope .staff-ph { color: var(--text3); font-size: 14px; flex: 1; }
.submit-scope .staff-caret { color: var(--text2); font-size: 10px; margin-left: auto; }
.submit-scope .staff-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.submit-scope .staff-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(79,142,247,0.15); color: var(--accent); border: 1px solid rgba(79,142,247,0.3); border-radius: 20px; padding: 3px 8px 3px 10px; font-size: 12px; font-weight: 600; }
.submit-scope .staff-chip button { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 11px; line-height: 1; padding: 0; }
.submit-scope .staff-panel { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 16px 40px rgba(0,0,0,0.5); overflow: hidden; }
.submit-scope .staff-search { width: 100%; padding: 10px 12px; background: var(--surface2); border: none; border-bottom: 1px solid var(--border); color: var(--text); font-family: inherit; font-size: 13px; }
.submit-scope .staff-search:focus { outline: none; }
.submit-scope .staff-list { max-height: 240px; overflow-y: auto; }
.submit-scope .staff-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; margin: 0; text-transform: none; letter-spacing: 0; border-bottom: 1px solid var(--border); }
.submit-scope .staff-item:hover { background: var(--surface2); }
.submit-scope .staff-item.checked { background: rgba(79,142,247,0.08); }
.submit-scope .staff-item input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
.submit-scope .si-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.submit-scope .si-name { font-size: 13px; font-weight: 600; color: var(--text); }
.submit-scope .si-sub { font-size: 10px; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.submit-scope .staff-empty { padding: 16px; text-align: center; color: var(--text3); font-size: 12px; }
.submit-scope .staff-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text2); }
.submit-scope .staff-foot button { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 5px 14px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.submit-scope .staff-note { margin-top: 8px; font-size: 11px; color: var(--accent2); }
/* Calendar checkbox */
.submit-scope .cal-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin: 0; text-transform: none; letter-spacing: 0; padding: 12px 14px; background: rgba(79,142,247,0.05); border: 1px solid rgba(79,142,247,0.25); border-radius: var(--radius); }
.submit-scope .cal-check input { position: absolute; opacity: 0; width: 0; height: 0; }
.submit-scope .cal-box { width: 18px; height: 18px; border: 2px solid var(--text3); border-radius: 5px; flex-shrink: 0; margin-top: 1px; transition: background .15s, border-color .15s; position: relative; }
.submit-scope .cal-check input:checked + .cal-box { background: var(--accent); border-color: var(--accent); }
.submit-scope .cal-check input:checked + .cal-box::after { content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 700; }
.submit-scope .cal-text { font-size: 13px; font-weight: 600; color: var(--text); display: flex; flex-direction: column; gap: 2px; }
.submit-scope .cal-text small { font-size: 11px; font-weight: 400; color: var(--text2); }
@media (max-width: 520px) { .submit-scope .form-row { grid-template-columns: 1fr; } }
`;
