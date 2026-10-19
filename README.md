# OPPESM Document Tracker

Document tracking system for the **Office of the Provincial Public Employment
Service Manager (OPPESM)**. Next.js app (deployed on Vercel) in front of your
existing Google Spreadsheet + Drive, reached through a Google Apps Script web app.

Rebuilt from the original PESO Apps Script tracker, reusing the architecture of
the Youth Christian Officers Board (Sheets-as-database, graceful degradation,
hashed-cookie admin auth).

## Architecture

```
Browser ─▶ Next.js (Vercel)  ─▶  Apps Script Web App  ─▶  Google Sheet + Drive
             API routes            (Code.gs)                (unchanged)
          auth · validation
```

- **Public submission form** (`/`) — open to anyone with the link. Camera/file
  upload, EXIF orientation correction, auto-filled processing time.
- **Admin dashboard** (`/admin`) — password-gated. Stats, document table with
  inline status/progress edits, For Printing sheet (printable), audit trail.
- **Backend** (`Code.gs`) — JSON data API over your spreadsheet; uploads files to
  `Uploaded_Documents/<controlNo>` in Drive.

## What changed from the original (fixes)

| Original flaw | Fix |
|---|---|
| Admin functions had no server-side auth (password only hid the UI) | Hashed-cookie session; every admin API route re-checks it. Password in env var, not source. |
| Control numbers could collide on concurrent submits | `LockService` serializes generation. |
| Sequence was a global running count | Now resets **daily** (`IN-260716-001`). |
| A Google Doc was created per submission | Removed — files go straight to the Drive subfolder. Faster, less quota. |
| `processingTime` was numeric-only | Now free text ("3 days", "5–7 working days"). |
| Anyone with the Apps Script `/exec` URL could read/delete data | Every request must carry a shared secret (`API_SECRET` ↔ `APPS_SCRIPT_SECRET`). |
| A deleted control number could be reissued | Next number = highest used today + 1. |
| Public staff list exposed phone numbers and emails | Browser only gets names/positions; emails are looked up server-side. |
| Uploads over Vercel's ~4.5 MB body limit failed | Photos are resized (≤2000 px JPEG) in the browser; total capped at 3 MB per submission with a clear message. |
| Audit trail always said "Admin" | Admins pick their name at login; it's recorded on every change. |
| Deleting a record left its Drive folder | The folder is moved to the Drive trash (recoverable 30 days). |

## Run locally (demo mode — no spreadsheet needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With `GOOGLE_APPS_SCRIPT_URL` blank it runs in
**demo mode** with sample data — explore the form and the dashboard freely.
Log into `/admin` with the password in `.env.local` (default `0000`).

## Connect your real spreadsheet

1. Open your spreadsheet → **Extensions → Apps Script**.
2. Paste `Code.gs` (the `SPREADSHEET_ID` is already set to your sheet).
3. **Deploy → New deployment → Web app** — *Execute as: Me*, *Who has access: Anyone*.
4. Copy the `/exec` URL.
5. **Project Settings → Script Properties → Add property** `API_SECRET` = a long random
   string. Use the same value for `APPS_SCRIPT_SECRET` in Vercel. Until this property is
   set the script accepts any request, so don't skip it.

**Updating `Code.gs` later:** paste the new code, then **Deploy → Manage deployments →
✏️ Edit → Version: New version → Deploy**. This keeps the same `/exec` URL. (Choosing
"New deployment" creates a new URL that Vercel doesn't know about.)

## Deploy to Vercel

1. Push this folder to a Git repo and import it in Vercel (framework: Next.js).
2. Set **Environment Variables**:
   - `GOOGLE_APPS_SCRIPT_URL` = the `/exec` URL from above
   - `APPS_SCRIPT_SECRET` = the same value as the `API_SECRET` Script Property
   - `ADMIN_PASSWORD` = a strong password
3. Deploy. The public form is at `/`, the admin dashboard at `/admin`.

## Staff assignment, calendar & email (Incoming Docs)

The submission form lets you assign **multiple staff** (from a **Staff Directory** sheet)
and, for **Incoming Docs**, tick **"Note this document to the PESO calendar."** On submit:

- Each assigned staffer is **emailed** the document + deadline.
- If the calendar box is ticked, an **all-day event** is created on the deadline date
  (submit date + processing days) with a reminder 1 day before, and the assigned staff
  are added as **guests** (Google sends them the invite).

**Setup (important):**
1. Run `seedStaffDirectory()` once from the Apps Script editor to create/fill the
   **Staff Directory** sheet (Name, Employee No, Position, Contact, Email, Status). Edit it anytime.
2. For calendar events and emails to come from **peso@bataan.gov.ph**, deploy the Apps Script
   Web App **under that account** (Execute as: Me = peso@bataan.gov.ph). If the spreadsheet is
   owned by another account, create the script under peso@bataan.gov.ph and share the sheet to it.
3. The first run will prompt you to **authorize Calendar + Gmail** permissions.
4. Email sending is subject to the account's daily quota (Google Workspace ≈ 1,500/day).

Demo mode previews the whole flow (multi-select, calendar checkbox), but no real emails or
calendar events are sent until it's connected under the right account.

## Tracked processes (Incoming ↔ Outgoing in one row)

A paper that goes out, comes back, and goes out again (e.g. **Project Proposal → returned
approved → PR & ObR → Budget Office**) still gets one Incoming/Outgoing record per movement,
but all of them share a **Tracking No.** (`TR-yyMMdd-###`) and show up as **one row** on the
admin **Processes** page, with a full timeline (time of each step, time spent at the other
office, who handled it).

- **Linking:** on the submission form, fill **Continuation of** with the earlier control no.
  (or tracking no.). In the admin table, the **🔗** button links any existing document.
- **Steps without a document** (e.g. "PR prepared", "ObR signed"): add them in the process
  panel as *Office + Note*. The time is recorded automatically.
- **Completion:** manual (*Mark complete* / *Cancel* / *Reopen*) **and** automatic — a process
  completes when its latest document is an **Outgoing marked Done** (or printed) and it has at
  least one earlier step. Linking a new step to a closed process reopens it.
- **Storage:** column **M** ("Tracking No") of *Incoming Docs* / *Outgoing Docs* (added
  automatically; column L is never touched), plus two new sheets: **Processes** and
  **Process Notes**.

## Notes

- Uploads are sent as base64 through the Next.js API, which Vercel caps at ~4.5 MB per
  request. Photos are shrunk automatically; other files (PDF, DOCX…) must total ≤ 3 MB
  per submission or MOV upload.
- Admin sign-in asks for your name (from the Staff Directory) plus the shared password.
  The name is self-declared — anyone with the password can pick any name — but it's what
  the Audit Trail records.
- Your spreadsheet columns are unchanged: `timestamp, controlNo, docType, title,
  description, fileUrl, staff, processingTime, statusDoc(Status), progress, printStatus`.
