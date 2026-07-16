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

## Deploy to Vercel

1. Push this folder to a Git repo and import it in Vercel (framework: Next.js).
2. Set **Environment Variables**:
   - `GOOGLE_APPS_SCRIPT_URL` = the `/exec` URL from above
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

## Notes

- Uploads are sent as base64 through the Next.js API. For very large batches,
  keep individual submissions to a few files / modest sizes.
- Your spreadsheet columns are unchanged: `timestamp, controlNo, docType, title,
  description, fileUrl, staff, processingTime, statusDoc(Status), progress, printStatus`.
