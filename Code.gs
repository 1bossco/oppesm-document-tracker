// ════════════════════════════════════════════════════════════
// OPPESM — DOCUMENT TRACKING SYSTEM
// Code.gs — Google Apps Script backend (JSON data API)
//
// This is the backend for the Next.js app deployed on Vercel. It no longer
// serves any HTML — it only reads/writes the spreadsheet and uploads files to
// Drive, returning JSON. The Next.js server calls this via GOOGLE_APPS_SCRIPT_URL.
//
// Deploy:
//   1. Extensions → Apps Script in your spreadsheet, paste this file.
//   2. Deploy → New deployment → Web app.
//        Execute as: Me    ·    Who has access: Anyone
//   3. Copy the /exec URL → set as GOOGLE_APPS_SCRIPT_URL in Vercel.
//   4. Project Settings → Script Properties → add API_SECRET (long random
//      value); set the same value as APPS_SCRIPT_SECRET in Vercel.
//   Updating later: Deploy → Manage deployments → Edit → Version: New version
//   (keeps the same /exec URL — don't use "New deployment").
//
// Sheets used (created automatically if missing):
//   Incoming Docs · Outgoing Docs · Title of Document · Printing · Audit Trail
//   Processes · Process Notes  (document tracking across IN/OUT movements)
//
// Column M of Incoming Docs / Outgoing Docs holds the Tracking No that links
// several movements of the same paper into one process.
// ════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "10z1k7InIQomQyq6pMoOF679fkPCzOT1iPtOIVjJl5Ks";
const FOLDER_NAME    = "Uploaded_Documents";
const TZ             = "Asia/Manila";

const TRACK_COL = 13; // column M — Tracking No on Incoming/Outgoing Docs
const MOVEMENT_SHEETS = ["Incoming Docs", "Outgoing Docs"];

const DOC_HEADERS = [
  "timestamp", "controlNo", "docType", "title", "description",
  "fileUrl", "staff", "processingTime", "statusDoc", "progress", "printStatus",
];

// ── Helpers ──────────────────────────────────────────────────
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function jsonOut_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fmt_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyy-MM-dd HH:mm");
  return value === null || value === undefined ? "" : String(value);
}

// Data rows (from row 2) padded to `cols` columns — a sheet may have fewer
// columns than requested, which getRange would reject.
function readRows_(sheet, cols) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  const width = Math.min(cols, sheet.getMaxColumns());
  return sheet.getRange(2, 1, n, width).getValues().map(function (r) {
    while (r.length < cols) r.push("");
    return r;
  });
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

// Shared secret between this script and the Next.js server. Set it under
// Project Settings → Script Properties → API_SECRET, and the same value as
// APPS_SCRIPT_SECRET in Vercel. While API_SECRET is unset, every request is
// allowed (so pasting this file never breaks a live site before it's configured).
function authorized_(key) {
  const secret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!secret) return true;
  return String(key || "") === secret;
}

// ════════════════════════════════════════════════════════════
// GET — read resources
// ════════════════════════════════════════════════════════════
function doGet(e) {
  if (!authorized_(e && e.parameter && e.parameter.key)) return jsonOut_({ error: "Unauthorized." });
  const resource = (e && e.parameter && e.parameter.resource) || "documents";
  try {
    if (resource === "documents") return jsonOut_(readDocuments_());
    if (resource === "titles")    return jsonOut_(readTitles_());
    if (resource === "printing")  return jsonOut_(readPrinting_());
    if (resource === "audit")     return jsonOut_(readAudit_());
    if (resource === "staff")     return jsonOut_(readStaff_());
    if (resource === "chat")      return jsonOut_(readChat_(e.parameter.controlNo));
    if (resource === "mov")       return jsonOut_(readMov_(e.parameter.controlNo));
    if (resource === "processes") return jsonOut_(readProcesses_());
    return jsonOut_({ error: "Unknown resource: " + resource });
  } catch (err) {
    return jsonOut_({ error: err.message });
  }
}

function readDocuments_() {
  const out = [];
  MOVEMENT_SHEETS.forEach(function (name) {
    const sheet = ss_().getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = readRows_(sheet, TRACK_COL);
    rows.forEach(function (r) {
      if (!r[1]) return; // no control number → skip
      out.push({
        timestamp: fmt_(r[0]), controlNo: fmt_(r[1]), docType: fmt_(r[2]) || name,
        title: fmt_(r[3]), description: fmt_(r[4]), fileUrl: fmt_(r[5]),
        staff: fmt_(r[6]), processingTime: fmt_(r[7]), dueDate: "", statusDoc: fmt_(r[8]),
        progress: fmt_(r[9]), printStatus: fmt_(r[10]), trackingNo: fmt_(r[TRACK_COL - 1]),
      });
    });
  });
  return out.concat(readTasks_());
}

// Tasks sheet columns:
// Timestamp | Control No | Doc Type | Title | Description | File URL | Staff | Due Date | Status | Progress
function readTasks_() {
  const sheet = ss_().getSheetByName("Tasks");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  return rows
    .filter(function (r) { return r[1]; })
    .map(function (r) {
      return {
        timestamp: fmt_(r[0]), controlNo: fmt_(r[1]), docType: "New Task",
        title: fmt_(r[3]), description: fmt_(r[4]), fileUrl: fmt_(r[5]),
        staff: fmt_(r[6]), processingTime: "", dueDate: fmtDate_(r[7]),
        statusDoc: fmt_(r[8]), progress: fmt_(r[9]), printStatus: "", trackingNo: "",
      };
    });
}

function fmtDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  return value ? String(value) : "";
}

function readTitles_() {
  const sheet = ss_().getSheetByName("Title of Document");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  return data
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { title: fmt_(r[0]), processingTime: fmt_(r[1]) }; });
}

function readPrinting_() {
  const outgoing = ss_().getSheetByName("Outgoing Docs");
  const titleSheet = ss_().getSheetByName("Title of Document");
  if (!outgoing || outgoing.getLastRow() < 2) return { rows: [], maxReceivers: 1 };

  const outData = outgoing.getRange(2, 1, outgoing.getLastRow() - 1, 11).getValues();
  const titleData = (titleSheet && titleSheet.getLastRow() > 1)
    ? titleSheet.getRange(2, 1, titleSheet.getLastRow() - 1, 10).getValues()
    : [];

  let maxReceivers = 1;
  titleData.forEach(function (r) {
    const count = r.slice(2, 10).filter(Boolean).length;
    if (count > maxReceivers) maxReceivers = count;
  });

  const rows = outData
    .filter(function (r) { return r[1] && r[10] === "For Printing"; })
    .map(function (r) {
      const match = titleData.find(function (t) { return t[0] === r[3]; });
      const receivers = match ? match.slice(2, 10).filter(Boolean).map(String) : [];
      return { timestamp: fmt_(r[0]), controlNo: fmt_(r[1]), title: fmt_(r[3]), description: fmt_(r[4]), receivers: receivers };
    });

  return { rows: rows, maxReceivers: maxReceivers };
}

function readAudit_() {
  const sheet = ss_().getSheetByName("Audit Trail");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return data
    .filter(function (r) { return r[0]; })
    .reverse()
    .map(function (r) {
      return { timestamp: fmt_(r[0]), user: fmt_(r[1]), action: fmt_(r[2]), controlNo: fmt_(r[3]), oldVal: fmt_(r[4]), newVal: fmt_(r[5]) };
    });
}

// Reads the "Staff Directory" sheet.
// Columns: Name | Employee No | Position | Contact | Email | Status
function readStaff_() {
  const sheet = ss_().getSheetByName("Staff Directory");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return data
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        name: fmt_(r[0]), employeeNo: fmt_(r[1]), position: fmt_(r[2]),
        contact: fmt_(r[3]), email: fmt_(r[4]), status: fmt_(r[5]),
      };
    });
}

// Task Chat sheet: Id | Control No | Author | Message | Created At
function getChatSheet_(ss) {
  let sheet = ss.getSheetByName("Task Chat");
  if (!sheet) {
    sheet = ss.insertSheet("Task Chat");
    sheet.appendRow(["Id", "Control No", "Author", "Message", "Created At"]);
  }
  return sheet;
}
function readChat_(controlNo) {
  const sheet = ss_().getSheetByName("Task Chat");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  return rows
    .filter(function (r) { return r[1] && (!controlNo || String(r[1]) === String(controlNo)); })
    .map(function (r) {
      return { id: fmt_(r[0]), controlNo: fmt_(r[1]), author: fmt_(r[2]), message: fmt_(r[3]), createdAt: isoOrText_(r[4]) };
    });
}

// Task MOV sheet: Id | Control No | Uploaded By | File Name | File URL | Note | Created At
function getMovSheet_(ss) {
  let sheet = ss.getSheetByName("Task MOV");
  if (!sheet) {
    sheet = ss.insertSheet("Task MOV");
    sheet.appendRow(["Id", "Control No", "Uploaded By", "File Name", "File URL", "Note", "Created At"]);
  }
  return sheet;
}
function readMov_(controlNo) {
  const sheet = ss_().getSheetByName("Task MOV");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  return rows
    .filter(function (r) { return r[1] && (!controlNo || String(r[1]) === String(controlNo)); })
    .map(function (r) {
      return { id: fmt_(r[0]), controlNo: fmt_(r[1]), uploadedBy: fmt_(r[2]), fileName: fmt_(r[3]), fileUrl: fmt_(r[4]), note: fmt_(r[5]), createdAt: isoOrText_(r[6]) };
    });
}

function isoOrText_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? "" : String(value);
}

// ════════════════════════════════════════════════════════════
// POST — actions: submit · updateStatus · markPrinted · delete · addChat · addMov
//                linkDocument · unlinkDocument · addProcessNote · setProcessStatus
// ════════════════════════════════════════════════════════════
function doPost(e) {
  let payload;
  try { payload = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut_({ success: false, error: "Invalid JSON body." }); }
  if (!authorized_(payload.key)) return jsonOut_({ success: false, error: "Unauthorized." });

  try {
    switch (payload.action) {
      case "submit":       return jsonOut_(submitDocument_(payload));
      case "updateStatus": return jsonOut_(updateStatus_(payload));
      case "markPrinted":  return jsonOut_(markPrinted_(payload));
      case "delete":       return jsonOut_(deleteDocument_(payload));
      case "addChat":      return jsonOut_(addChat_(payload));
      case "addMov":       return jsonOut_(addMov_(payload));
      case "linkDocument":     return jsonOut_(linkDocument_(payload));
      case "unlinkDocument":   return jsonOut_(unlinkDocument_(payload));
      case "addProcessNote":   return jsonOut_(addProcessNote_(payload));
      case "setProcessStatus": return jsonOut_(setProcessStatusAction_(payload));
      default:             return jsonOut_({ success: false, error: "Unknown action." });
    }
  } catch (err) {
    return jsonOut_({ success: false, error: err.message });
  }
}

// ── Submit ───────────────────────────────────────────────────
function submitDocument_(p) {
  const lock = LockService.getScriptLock();
  // Serialize control-number generation so concurrent submits never collide.
  lock.waitLock(30000);
  try {
    const ss = ss_();
    const timestamp = new Date();
    const isTask = p.docType === "New Task";
    const isIncoming = p.docType === "Incoming Docs";
    const docType = isTask ? "New Task" : (isIncoming ? "Incoming Docs" : "Outgoing Docs");
    const prefix = isTask ? "TK" : (isIncoming ? "IN" : "OG");
    const dateStr = Utilities.formatDate(timestamp, TZ, "yyMMdd");
    const sheet = isTask ? getTasksSheet_(ss) : ss.getSheetByName(docType);
    if (!sheet) throw new Error("Sheet not found: " + docType);

    // "Continuation of" — an earlier control no. or tracking no. this paper
    // belongs to. Checked before anything is written or uploaded.
    const continuationOf = isTask ? "" : String(p.continuationOf || "").trim().toUpperCase();
    if (continuationOf && !(isTrackingNo_(continuationOf) ? findProcess_(ss, continuationOf) : findMovement_(ss, continuationOf))) {
      return { success: false, error: "Not found: " + continuationOf + ". Check the control number on the paper." };
    }

    // Daily sequence — highest number used today + 1 (never reuses a deleted number).
    const seqNum = nextSeq_(sheet, prefix + "-" + dateStr);
    const controlNo = prefix + "-" + dateStr + "-" + String(seqNum).padStart(3, "0");

    // Upload files to a Drive subfolder (skipped for tasks with no files).
    let fileUrl = "";
    if (p.files && p.files.length) {
      const parent = getOrCreateFolder_(FOLDER_NAME);
      const docFolder = parent.createFolder(controlNo);
      p.files.forEach(function (f) {
        const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, f.name);
        docFolder.createFile(blob);
      });
      fileUrl = docFolder.getUrl();
    }

    let deadline = null;
    let processingTime = "";

    if (isTask) {
      // Tasks carry an explicit due date.
      const dueStr = p.dueDate || "";
      if (dueStr) deadline = parseYmd_(dueStr);
      sheet.appendRow([
        timestamp, controlNo, docType, p.title, p.description || "",
        fileUrl, p.staff || "", dueStr, "In Progress", "In Progress",
      ]);
    } else {
      // Documents derive the deadline from processing days.
      processingTime = p.processingTime || "";
      if (!processingTime) {
        const titleSheet = ss.getSheetByName("Title of Document");
        if (titleSheet && titleSheet.getLastRow() > 1) {
          const td = titleSheet.getRange(2, 1, titleSheet.getLastRow() - 1, 2).getValues();
          const m = td.find(function (r) { return r[0] === p.title; });
          if (m) processingTime = m[1];
        }
      }
      const days = parseProcessingDays_(processingTime);
      if (days !== null) deadline = addDays_(timestamp, days);

      const printStatus = docType === "Outgoing Docs" ? "For Printing" : "";
      sheet.appendRow([
        timestamp, controlNo, docType, p.title, p.description || "",
        fileUrl, p.staff || "", processingTime, "In Progress", "In Progress", printStatus,
      ]);
      if (docType === "Outgoing Docs") updatePrintingSheet_(ss, controlNo, p.title, p.description || "", timestamp);
    }

    logAudit_(ss, "Submit", controlNo, "", "Submitted", p.staff || "User");

    let trackingNo = "";
    if (continuationOf) {
      const mov = { sheet: sheet, row: sheet.getLastRow(), controlNo: controlNo, trackingNo: "" };
      trackingNo = joinProcess_(ss, mov, continuationOf, p.staff || "Submission form");
      logAudit_(ss, "Link to process", controlNo, "", trackingNo, p.staff || "Submission form");
    }

    const emails = (p.staffEmails || []).filter(Boolean);

    // Calendar note (Incoming Docs and Tasks) — all-day event + reminder, staff as guests.
    let calendarOk = false;
    if (p.addToCalendar && (isIncoming || isTask) && deadline) {
      calendarOk = addToCalendar_(controlNo, p.title, p.description || "", deadline, processingTime, emails);
    }

    // Notify assigned staff by email (from the account running this script).
    const notified = emails.length ? notifyStaff_(controlNo, docType, p.title, p.description || "", processingTime, deadline, emails) : 0;

    return {
      success: true,
      controlNo: controlNo,
      trackingNo: trackingNo,
      notified: notified,
      calendar: calendarOk,
      deadline: deadline ? Utilities.formatDate(deadline, TZ, "yyyy-MM-dd") : "",
    };
  } finally {
    lock.releaseLock();
  }
}

// Ensures the "Tasks" sheet exists with headers.
function getTasksSheet_(ss) {
  let sheet = ss.getSheetByName("Tasks");
  if (!sheet) {
    sheet = ss.insertSheet("Tasks");
    sheet.appendRow(["Timestamp", "Control No", "Doc Type", "Title", "Description", "File URL", "Staff", "Due Date", "Status", "Progress"]);
  }
  return sheet;
}

// Parse "yyyy-MM-dd" → Date (local midnight). null if unparseable.
function parseYmd_(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// First integer in a processing-time string ("6 days" → 6). null if none.
function parseProcessingDays_(pt) {
  const m = String(pt || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n > 0 ? n : null;
}
function addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

// Creates an all-day event on the running account's default calendar
// (deploy the web app as peso@bataan.gov.ph so this is the PESO calendar).
function addToCalendar_(controlNo, title, description, deadline, processingTime, emails) {
  try {
    const cal = CalendarApp.getDefaultCalendar();
    const body =
      "Control No: " + controlNo +
      "\nTitle: " + title +
      "\nDescription: " + description +
      "\nProcessing time: " + processingTime +
      "\nDeadline: " + Utilities.formatDate(deadline, TZ, "yyyy-MM-dd");
    const options = { description: body };
    if (emails.length) { options.guests = emails.join(","); options.sendInvites = true; }
    const event = cal.createAllDayEvent("[" + controlNo + "] " + title + " — Deadline", deadline, options);
    // Remind 1 day before.
    event.addPopupReminder(24 * 60);
    event.addEmailReminder(24 * 60);
    return true;
  } catch (err) {
    Logger.log("Calendar error: " + err.message);
    return false;
  }
}

// Emails each assigned staff about the document + deadline.
function notifyStaff_(controlNo, docType, title, description, processingTime, deadline, emails) {
  let sent = 0;
  const deadlineStr = deadline ? Utilities.formatDate(deadline, TZ, "MMMM d, yyyy") : "Not specified";
  const subject = "OPPESM Document Assigned: " + controlNo;
  emails.forEach(function (email) {
    try {
      const html =
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
        '<h2 style="color:#1e3a5f;margin:0 0 4px">OPPESM Document Tracking</h2>' +
        '<p style="color:#666;margin:0 0 16px">You have been assigned to a document.</p>' +
        '<table style="border-collapse:collapse">' +
        row_("Control No.", controlNo) +
        row_("Type", docType) +
        row_("Title", title) +
        row_("Description", description) +
        row_("Processing time", processingTime || "—") +
        row_("Deadline", deadlineStr) +
        '</table>' +
        '<p style="color:#888;font-size:12px;margin-top:18px">This is an automated message from the OPPESM Document Tracking System.</p>' +
        '</div>';
      MailApp.sendEmail({ to: email, subject: subject, htmlBody: html });
      sent++;
    } catch (err) {
      Logger.log("Email error (" + email + "): " + err.message);
    }
  });
  return sent;
}
function row_(label, value) {
  return '<tr><td style="padding:4px 12px 4px 0;color:#888;vertical-align:top">' + label +
    '</td><td style="padding:4px 0;font-weight:600">' + (value || "—") + '</td></tr>';
}

// `col` is the column holding the IDs (default 2 = Control No).
function nextSeq_(sheet, controlPrefix, col) {
  if (sheet.getLastRow() < 2) return 1;
  const ids = sheet.getRange(2, col || 2, sheet.getLastRow() - 1, 1).getValues();
  let max = 0;
  ids.forEach(function (r) {
    const id = String(r[0]);
    if (id.indexOf(controlPrefix + "-") === 0) {
      const n = parseInt(id.slice(controlPrefix.length + 1), 10);
      if (n > max) max = n;
    }
  });
  return max + 1;
}

function updatePrintingSheet_(ss, controlNo, title, description, timestamp) {
  try {
    const printSheet = ss.getSheetByName("Printing");
    const titleSheet = ss.getSheetByName("Title of Document");
    if (!printSheet) return;

    let receivers = [];
    if (titleSheet && titleSheet.getLastRow() > 1) {
      const td = titleSheet.getRange(2, 1, titleSheet.getLastRow() - 1, 10).getValues();
      const m = td.find(function (r) { return r[0] === title; });
      if (m) receivers = m.slice(2, 10).filter(Boolean);
    }

    if (printSheet.getLastRow() < 1) {
      const headers = ["Timestamp", "Control No", "Title", "Description"];
      for (let i = 1; i <= 8; i++) headers.push("Received by " + i);
      printSheet.appendRow(headers);
    }

    const ts = Utilities.formatDate(new Date(timestamp), TZ, "yyyy-MM-dd HH:mm");
    const row = [ts, controlNo, title, description];
    for (let i = 0; i < 8; i++) row.push(receivers[i] ? "Received by: " + receivers[i] : "");
    printSheet.appendRow(row);
  } catch (err) {
    Logger.log("updatePrintingSheet error: " + err.message);
  }
}

// ── Update a single field ────────────────────────────────────
function updateStatus_(p) {
  const colMap = { progress: 10, statusDoc: 9, printStatus: 11 };
  const col = colMap[p.field];
  if (!col) return { success: false, error: "Unknown field: " + p.field };

  const ss = ss_();
  const names = ["Incoming Docs", "Outgoing Docs", "Tasks"];
  for (let n = 0; n < names.length; n++) {
    const sheet = ss.getSheetByName(names[n]);
    if (!sheet || sheet.getLastRow() < 2) continue;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
    const idx = data.findIndex(function (r) { return r[1] === p.controlNo; });
    if (idx !== -1) {
      const sheetRow = idx + 2;
      const oldVal = data[idx][col - 1];
      sheet.getRange(sheetRow, col).setValue(p.value);
      logAudit_(ss, "Update " + p.field, p.controlNo, oldVal, p.value, p.user || "Admin");
      if (p.field === "progress" && p.value === "Done") autoCompleteFor_(ss, p.controlNo, p.user || "Admin");
      return { success: true };
    }
  }
  return { success: false, error: "Document not found." };
}

// ── Mark printed → also Progress = Done ──────────────────────
function markPrinted_(p) {
  const ss = ss_();
  const sheet = ss.getSheetByName("Outgoing Docs");
  if (!sheet || sheet.getLastRow() < 2) return { success: false, error: "Sheet not found." };
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  const idx = data.findIndex(function (r) { return r[1] === p.controlNo; });
  if (idx === -1) return { success: false, error: "Control number not found." };

  const sheetRow = idx + 2;
  sheet.getRange(sheetRow, 9).setValue("Done");     // statusDoc
  sheet.getRange(sheetRow, 10).setValue("Done");    // progress
  sheet.getRange(sheetRow, 11).setValue("Printed"); // printStatus
  logAudit_(ss, "Mark Printed", p.controlNo, "For Printing", "Printed → Done", p.user || "Admin");
  autoCompleteFor_(ss, p.controlNo, p.user || "Admin");
  return { success: true };
}

// ── Delete from all sheets ───────────────────────────────────
function deleteDocument_(p) {
  const ss = ss_();
  ["Incoming Docs", "Outgoing Docs", "Tasks", "Printing", "Task Chat", "Task MOV"].forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i][1] === p.controlNo) sheet.deleteRow(i + 2);
    }
  });

  // Move the document's upload folder to the Drive trash (recoverable for 30 days).
  try {
    const parent = getOrCreateFolder_(FOLDER_NAME);
    const folders = parent.getFoldersByName(p.controlNo);
    while (folders.hasNext()) folders.next().setTrashed(true);
  } catch (err) {
    Logger.log("Drive cleanup error: " + err.message);
  }

  logAudit_(ss, "Delete", p.controlNo, "", "Deleted", p.user || "Admin");
  return { success: true };
}

// ── Task chat ────────────────────────────────────────────────
function addChat_(p) {
  const controlNo = String(p.controlNo || "").trim();
  const message = String(p.message || "").trim();
  if (!controlNo || !message) return { success: false, error: "Control number and message are required." };
  const ss = ss_();
  const sheet = getChatSheet_(ss);
  const id = "chat-" + Date.now();
  sheet.appendRow([id, controlNo, p.author || "Unknown", message, new Date()]);
  return { success: true, id: id };
}

// ── Task MOV (Means of Verification) ─────────────────────────
function addMov_(p) {
  const controlNo = String(p.controlNo || "").trim();
  const file = p.file;
  if (!controlNo || !file || !file.data) return { success: false, error: "Control number and file are required." };

  const ss = ss_();
  // Store the MOV file in the task's Drive subfolder (created if needed).
  const parent = getOrCreateFolder_(FOLDER_NAME);
  let folder;
  const existing = parent.getFoldersByName(controlNo);
  folder = existing.hasNext() ? existing.next() : parent.createFolder(controlNo);
  const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.type, file.name);
  const driveFile = folder.createFile(blob);
  const fileUrl = driveFile.getUrl();

  const sheet = getMovSheet_(ss);
  const id = "mov-" + Date.now();
  sheet.appendRow([id, controlNo, p.uploadedBy || "Unknown", file.name, fileUrl, p.note || "", new Date()]);
  return { success: true, id: id, fileUrl: fileUrl };
}

// ════════════════════════════════════════════════════════════
// PROCESSES — one tracked process spans several IN/OUT movements
//   Processes:     Tracking No | Subject | Status | Created At | Closed At | Created By
//   Process Notes: Id | Tracking No | Office | Note | By | Created At
// Status: Open · Completed · Cancelled
// ════════════════════════════════════════════════════════════
function isTrackingNo_(ref) { return /^TR-/i.test(String(ref)); }

function getProcessesSheet_(ss) {
  let sheet = ss.getSheetByName("Processes");
  if (!sheet) {
    sheet = ss.insertSheet("Processes");
    sheet.appendRow(["Tracking No", "Subject", "Status", "Created At", "Closed At", "Created By"]);
  }
  return sheet;
}
function getProcessNotesSheet_(ss) {
  let sheet = ss.getSheetByName("Process Notes");
  if (!sheet) {
    sheet = ss.insertSheet("Process Notes");
    sheet.appendRow(["Id", "Tracking No", "Office", "Note", "By", "Created At"]);
  }
  return sheet;
}

function readProcesses_() {
  const ss = ss_();
  const ps = ss.getSheetByName("Processes");
  const ns = ss.getSheetByName("Process Notes");
  const processes = ps ? readRows_(ps, 6).filter(function (r) { return r[0]; }).map(function (r) {
    return { trackingNo: fmt_(r[0]), subject: fmt_(r[1]), status: fmt_(r[2]) || "Open", createdAt: isoOrText_(r[3]), closedAt: isoOrText_(r[4]), createdBy: fmt_(r[5]) };
  }) : [];
  const notes = ns ? readRows_(ns, 6).filter(function (r) { return r[1]; }).map(function (r) {
    return { id: fmt_(r[0]), trackingNo: fmt_(r[1]), office: fmt_(r[2]), note: fmt_(r[3]), by: fmt_(r[4]), createdAt: isoOrText_(r[5]) };
  }) : [];
  return { processes: processes, notes: notes };
}

// The Incoming/Outgoing row for a control number (upper-case), or null.
function findMovement_(ss, controlNo) {
  for (let n = 0; n < MOVEMENT_SHEETS.length; n++) {
    const sheet = ss.getSheetByName(MOVEMENT_SHEETS[n]);
    if (!sheet || sheet.getLastRow() < 2) continue;
    const rows = readRows_(sheet, TRACK_COL);
    const idx = rows.findIndex(function (r) { return String(r[1]).toUpperCase() === controlNo; });
    if (idx !== -1) {
      return { sheet: sheet, row: idx + 2, controlNo: String(rows[idx][1]), title: fmt_(rows[idx][3]), trackingNo: fmt_(rows[idx][TRACK_COL - 1]) };
    }
  }
  return null;
}

function findProcess_(ss, trackingNo) {
  const sheet = ss.getSheetByName("Processes");
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = readRows_(sheet, 6);
  const want = String(trackingNo).toUpperCase();
  const idx = rows.findIndex(function (r) { return String(r[0]).toUpperCase() === want; });
  return idx === -1 ? null : { sheet: sheet, row: idx + 2, trackingNo: String(rows[idx][0]), status: fmt_(rows[idx][2]) || "Open" };
}

// Writes the Tracking No into column M, adding columns / the header if needed.
function setTrackingNo_(sheet, row, trackingNo) {
  if (sheet.getMaxColumns() < TRACK_COL) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), TRACK_COL - sheet.getMaxColumns());
  }
  if (!sheet.getRange(1, TRACK_COL).getValue()) sheet.getRange(1, TRACK_COL).setValue("Tracking No");
  sheet.getRange(row, TRACK_COL).setValue(trackingNo);
}

function createProcess_(ss, subject, user) {
  const sheet = getProcessesSheet_(ss);
  const prefix = "TR-" + Utilities.formatDate(new Date(), TZ, "yyMMdd");
  const trackingNo = prefix + "-" + String(nextSeq_(sheet, prefix, 1)).padStart(3, "0");
  sheet.appendRow([trackingNo, subject, "Open", new Date(), "", user]);
  logAudit_(ss, "Create process", trackingNo, "", subject, user);
  return trackingNo;
}

function setProcessStatus_(ss, trackingNo, status, user, action) {
  const proc = findProcess_(ss, trackingNo);
  if (!proc) return false;
  if (proc.status === status) return true;
  proc.sheet.getRange(proc.row, 3).setValue(status);
  proc.sheet.getRange(proc.row, 5).setValue(status === "Open" ? "" : new Date());
  logAudit_(ss, action, proc.trackingNo, proc.status, status, user);
  return true;
}

// Puts movement `mov` ({sheet, row, controlNo, trackingNo}) into the process
// named by `ref` — a tracking no., or another document's control no. If that
// document isn't in a process yet, it joins mov's process, or a new one is
// created. Returns the tracking no. Caller must hold the script lock.
function joinProcess_(ss, mov, ref, user) {
  ref = String(ref).trim().toUpperCase();
  if (ref === String(mov.controlNo).toUpperCase()) throw new Error("A document can't be linked to itself.");

  let trackingNo;
  if (isTrackingNo_(ref)) {
    const proc = findProcess_(ss, ref);
    if (!proc) throw new Error("Tracking number not found: " + ref);
    trackingNo = proc.trackingNo;
  } else {
    const prev = findMovement_(ss, ref);
    if (!prev) throw new Error("Control number not found: " + ref);
    trackingNo = prev.trackingNo || mov.trackingNo || createProcess_(ss, prev.title, user);
    if (!prev.trackingNo) setTrackingNo_(prev.sheet, prev.row, trackingNo);
  }
  setTrackingNo_(mov.sheet, mov.row, trackingNo);

  // A new step on a closed process reopens it.
  const proc = findProcess_(ss, trackingNo);
  if (proc && proc.status !== "Open") setProcessStatus_(ss, trackingNo, "Open", user, "Reopen process");
  return trackingNo;
}

// Auto-complete: an open process closes when its latest step is an Outgoing
// document marked Done and it has at least one earlier step (the paper came
// back at least once, or the process started as Incoming).
function autoCompleteFor_(ss, controlNo, user) {
  try {
    const mov = findMovement_(ss, String(controlNo).toUpperCase());
    if (!mov || !mov.trackingNo) return;
    const proc = findProcess_(ss, mov.trackingNo);
    if (!proc || proc.status !== "Open") return;

    const steps = [];
    MOVEMENT_SHEETS.forEach(function (name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet || sheet.getLastRow() < 2) return;
      readRows_(sheet, TRACK_COL).forEach(function (r) {
        if (r[1] && fmt_(r[TRACK_COL - 1]) === mov.trackingNo) {
          const t = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
          steps.push({ time: t || 0, sheet: name, progress: String(r[9]) });
        }
      });
    });
    if (steps.length < 2) return;
    steps.sort(function (a, b) { return a.time - b.time; });
    const last = steps[steps.length - 1];
    if (last.sheet === "Outgoing Docs" && last.progress === "Done") {
      setProcessStatus_(ss, mov.trackingNo, "Completed", user, "Auto-complete process");
    }
  } catch (err) {
    Logger.log("autoComplete error: " + err.message);
  }
}

// ── Process actions ──────────────────────────────────────────
function linkDocument_(p) {
  const controlNo = String(p.controlNo || "").trim().toUpperCase();
  const ref = String(p.ref || "").trim().toUpperCase();
  if (!controlNo || !ref) return { success: false, error: "Both a document and what to link it to are required." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = ss_();
    const mov = findMovement_(ss, controlNo);
    if (!mov) return { success: false, error: "Only Incoming/Outgoing documents can be linked." };
    const trackingNo = joinProcess_(ss, mov, ref, p.user || "Admin");
    logAudit_(ss, "Link to process", mov.controlNo, mov.trackingNo, trackingNo, p.user || "Admin");
    return { success: true, trackingNo: trackingNo };
  } finally {
    lock.releaseLock();
  }
}

function unlinkDocument_(p) {
  const ss = ss_();
  const mov = findMovement_(ss, String(p.controlNo || "").trim().toUpperCase());
  if (!mov) return { success: false, error: "Document not found." };
  if (!mov.trackingNo) return { success: true };
  mov.sheet.getRange(mov.row, TRACK_COL).setValue("");
  logAudit_(ss, "Unlink from process", mov.controlNo, mov.trackingNo, "", p.user || "Admin");
  return { success: true };
}

function addProcessNote_(p) {
  const office = String(p.office || "").trim();
  const note = String(p.note || "").trim();
  if (!office && !note) return { success: false, error: "Enter an office or a note." };
  const ss = ss_();
  const proc = findProcess_(ss, String(p.trackingNo || "").trim());
  if (!proc) return { success: false, error: "Process not found." };
  const id = "pn-" + Date.now();
  const createdAt = new Date();
  getProcessNotesSheet_(ss).appendRow([id, proc.trackingNo, office, note, p.user || "Admin", createdAt]);
  logAudit_(ss, "Process note", proc.trackingNo, "", (office ? office + ": " : "") + note, p.user || "Admin");
  return { success: true, id: id, createdAt: createdAt.toISOString() };
}

function setProcessStatusAction_(p) {
  const status = String(p.status || "");
  if (["Open", "Completed", "Cancelled"].indexOf(status) === -1) return { success: false, error: "Unknown status." };
  const ok = setProcessStatus_(ss_(), String(p.trackingNo || "").trim(), status, p.user || "Admin", "Process " + status.toLowerCase());
  return ok ? { success: true } : { success: false, error: "Process not found." };
}

// ── Audit log ────────────────────────────────────────────────
function logAudit_(ss, action, controlNo, oldVal, newVal, user) {
  try {
    const sheet = ss.getSheetByName("Audit Trail");
    if (!sheet) return;
    sheet.appendRow([new Date(), user, action, controlNo, oldVal, newVal]);
  } catch (err) {
    Logger.log("Audit log error: " + err.message);
  }
}

// ════════════════════════════════════════════════════════════
// One-time setup helper — run once from the Apps Script editor to create and
// populate the "Staff Directory" sheet with the OPPESM roster. Safe to edit the
// sheet afterwards; the app reads it live. Re-running rewrites the roster.
// ════════════════════════════════════════════════════════════
function seedStaffDirectory() {
  const ss = ss_();
  let sheet = ss.getSheetByName("Staff Directory");
  if (!sheet) sheet = ss.insertSheet("Staff Directory");
  sheet.clear();
  sheet.appendRow(["Name", "Employee No", "Position", "Contact", "Email", "Status"]);
  const staff = [
    ["Anillo, Kevin Morales", "30009977", "LEO III", "0912-368-7504", "kevinanillo09@gmail.com", "Permanent"],
    ["Bacala, John-John Bato", "30000295", "RMO III", "0930-336-5355", "", "Permanent"],
    ["Balbuena, Francis San Diego", "10011664", "LEO II", "0927-153-2758", "francisbalbuena1998@gmail.com", "Permanent"],
    ["Basalo, Maria Eva Malinao", "30000299", "PESO MANAGER", "0946-718-8081", "mariaevabasalo22@gmail.com", "Permanent"],
    ["Cadungog, Sweetsel Guarin", "210010691", "LEO III", "0948-651-6128", "sweetselgc@gmail.com", "Permanent"],
    ["Concepcion, Liza Enriquez", "300010996", "Supervising LEO", "0995-254-3364", "lizaeconcepcion@gmail.com", "Permanent"],
    ["Ferrer, Patricia Mae Dadural", "300000001", "C.O. I", "0905-435-9257", "patriciamaedadural88@gmail.com", "Permanent"],
    ["Del Mundo, Erwel Martin", "350011948", "BB II", "0938-043-2397 / 0919-067-8917", "emartindelmundo@gmail.com", "Permanent"],
    ["Masamoc, Ariel Apigo", "30000302", "Senior LEO", "0930-400-1461", "arielmasamoc8869@gmail.com", "Permanent"],
    ["Recio, Jinky Larion", "30009596", "C.O. III", "0953-126-2528 / 0977-465-0545", "recio.jinky@gmail.com", "Permanent"],
    ["Soriano, Rovinnel Manuel", "30009595", "LEO III", "0909-491-2214", "rovinnelsoriano5@gmail.com", "Permanent"],
    ["Trajano, Mary Jane Vitug", "30000301", "C.O. III", "0912-477-6655", "trajanomaryjane@gmail.com", "Permanent"],
    ["Villaruz, Ruth De Gollo", "14009829", "BB II", "0939-627-0504", "villaruzruth1982@yahoo.com", "Permanent"],
    ["Ambrocio, Carl Kevin Cruz", "300013360", "Admin. Aide IV", "0969-411-7792", "carlambrocio0@gmail.com", "Job Order"],
    ["Cruz, Mark Lester De Jesus", "60010471", "LEO II", "0917-457-3655", "mrklstrcruz@gmail.com", "Job Order"],
  ];
  sheet.getRange(2, 1, staff.length, 6).setValues(staff);
}
