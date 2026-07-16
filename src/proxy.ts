import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Next.js 16 replacement for middleware.ts. Optimistic gate only — every
// protected API route re-checks the session itself, so this is not the sole
// authorization layer. Only the /admin dashboard and admin data routes are
// gated; the public submission form and its endpoints stay open.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) {
    return NextResponse.next();
  }

  // API callers get a status they can act on; humans get sent to the login page.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Gate the admin dashboard and the admin-only data routes. Everything else
  // (submission form, /api/titles, /api/submit, /api/login) is public.
  matcher: [
    "/admin/:path*",
    "/api/documents/:path*",
    "/api/printing/:path*",
    "/api/audit/:path*",
    "/api/chat/:path*",
    "/api/mov/:path*",
  ],
};
