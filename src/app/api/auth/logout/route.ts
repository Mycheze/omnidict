import { NextRequest, NextResponse } from "next/server";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie.
 */
async function logoutHandler(_request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export const POST = withSecurity(logoutHandler, DEFAULT_SECURITY);
