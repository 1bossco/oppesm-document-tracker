// Shared client for the Google Apps Script web app that fronts the OPPESM
// spreadsheet + Drive. Same pattern as the youth board: the Apps Script exec
// URL lives in an env var, and every read/write goes through here.
//
// A read returns `null` (not `[]`) when the backend isn't reachable, so callers
// can tell "not connected" apart from "connected but empty" and fall back to
// sample data for local preview.

export function getBackendUrl(): string | undefined {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  return url && url.trim() !== "" ? url.trim() : undefined;
}

export function isBackendConnected(): boolean {
  return Boolean(getBackendUrl());
}

/** GET a resource from the Apps Script backend. `null` means not reachable. */
export async function backendGet<T>(
  resource: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const url = getBackendUrl();
  if (!url) return null;

  try {
    const search = new URLSearchParams({ resource, ...params });
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}${search.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    return JSON.parse(await response.text()) as T;
  } catch {
    return null;
  }
}

export interface BackendResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

/** POST an action to the Apps Script backend. */
export async function backendPost(
  payload: Record<string, unknown>
): Promise<BackendResult> {
  const url = getBackendUrl();
  if (!url) return { ok: false, error: "The spreadsheet backend is not connected." };

  try {
    const response = await fetch(url, {
      method: "POST",
      // text/plain avoids a CORS preflight against Apps Script while still
      // sending a JSON body the backend parses by hand.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: `Backend responded with ${response.status}.` };
    }

    const parsed = JSON.parse(await response.text());
    if (parsed && parsed.success === false) {
      return { ok: false, error: parsed.error || "Backend reported a failure." };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: "Could not reach the spreadsheet backend." };
  }
}
