// Shared-password gate for the OPPESM admin dashboard.
//
// The cookie never holds the password itself, only a hash of it. Web Crypto is
// used (rather than node:crypto) because this same code runs inside proxy.ts,
// which may execute on the Edge runtime. This replaces the original tracker's
// client-only `verifyAdminPassword` — every admin API route now re-checks the
// session server-side.

export const SESSION_COOKIE = "oppesm_admin_session";

export function getAdminPassword(): string | undefined {
  const password = process.env.ADMIN_PASSWORD;
  return password && password.trim() !== "" ? password : undefined;
}

/** When no password is configured the admin stays open — nothing to enforce. */
export function isAuthEnabled(): boolean {
  return getAdminPassword() !== undefined;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The value we expect to find in a valid session cookie. */
export async function expectedSessionToken(): Promise<string | undefined> {
  const password = getAdminPassword();
  if (!password) return undefined;
  return sha256Hex(`oppesm-admin:${password}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  if (!token) return false;
  const expected = await expectedSessionToken();
  return expected !== undefined && timingSafeEqual(token, expected);
}

export async function isCorrectPassword(candidate: string): Promise<boolean> {
  const password = getAdminPassword();
  if (!password) return true;
  // Compare hashes so the check doesn't leak length via early exit.
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(password)]);
  return timingSafeEqual(a, b);
}
