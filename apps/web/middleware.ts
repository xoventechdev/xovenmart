import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side route guard.
 *
 * Auth tokens are stored in localStorage (kept client-side for CSRF reasons),
 * but we also mirror the audience flag (`admin` | `rider` | `customer`) in a
 * cookie that middleware can read. This lets us bounce unauthenticated
 * visitors AWAY from protected pages before any HTML is rendered.
 *
 * Rules:
 *   /admin/login              → always allowed (login form is public)
 *   /admin/*   (anything else) → requires `audience=admin` cookie, else
 *                                redirect to /admin/login
 *   /rider/login              → always allowed
 *   /rider/*    (anything else) → requires `audience=rider` cookie, else
 *                                redirect to /rider/login
 *
 * The actual JWT still travels via `Authorization: Bearer …` on every API
 * request — middleware only checks for a *hint* that the visitor has logged in.
 * The API's `AuthGuard` + `RolesGuard` are the real source of truth.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin gate ────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Login page is always reachable.
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    const audience = req.cookies.get("audience")?.value;
    if (audience !== "admin") {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Rider gate ────────────────────────────────────────────────────
  if (pathname.startsWith("/rider")) {
    if (pathname === "/rider/login") {
      return NextResponse.next();
    }
    const audience = req.cookies.get("audience")?.value;
    if (audience !== "rider") {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/rider/login";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Only run middleware on admin + rider paths. Public site is unaffected.
export const config = {
  matcher: ["/admin/:path*", "/rider/:path*"],
};