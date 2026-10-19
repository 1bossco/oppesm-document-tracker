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
// ════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "10z1k7InIQomQyq6pMoOF679fkPCzOT1iPtOIVjJl5Ks";
const FOLDER_NAME    = "Uploaded_Documents";
const TZ             = "Asia/Manila";

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
    return jsonOut_({ error: "Unknown resource: " + resource });
  } catch (err) {
    return jsonOut_({ error: err.message });
  }
}

function readDocuments_() {
  const out = [];
  ["Incoming Docs", "Outgoing Docs"].forEach(function (name) {
    const sheet = ss_().getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
    rows.forEach(function (r) {
      if (!r[1]) return; // no control number → skip
      out.push({
        timestamp: fmt_(r[0]), controlNo: fmt_(r[1]), docType: fmt_(r[2]) || name,
        title: fmt_(r[3]), description: fmt_(r[4]), fileUrl: fmt_(r[5]),
        staff: fmt_(r[6]), processingTime: fmt_(r[7]), dueDate: "", statusDoc: fmt_(r[8]),
        progress: fmt_(r[9]), printStatus: fmt_(r[10]),
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
        statusDoc: fmt_(r[8]), progress: fmt_(r[9]), printStatus: "",
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

function nextSeq_(sheet, controlPrefix) {
  if (sheet.getLastRow() < 2) return 1;
  const ids = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
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
