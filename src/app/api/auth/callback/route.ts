import { NextRequest, NextResponse } from "next/server";
import { verifySsoResponse, timingSafeEqualStrings } from "@/lib/auth/sso";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import DatabaseManager from "@/lib/database";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "omnidict_sso_nonce";

/** Delete the nonce cookie on the outgoing response (always, success or not). */
function clearNonceCookie(response: NextResponse): NextResponse {
  response.cookies.set(NONCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

/**
 * GET /api/auth/callback
 *
 * Completes the Refold SSO flow: verifies the signed response payload,
 * checks the nonce against the cookie set at login, upserts the user, issues
 * a session cookie, and redirects to the app root.
 */
export async function GET(request: NextRequest) {
  const payload = request.nextUrl.searchParams.get("payload");
  const sig = request.nextUrl.searchParams.get("sig");

  if (!payload || !sig) {
    return clearNonceCookie(
      NextResponse.json(
        { error: "Missing payload or sig parameters" },
        { status: 403 },
      ),
    );
  }

  const ssoUser = verifySsoResponse(payload, sig);
  if (!ssoUser) {
    console.error("[auth/callback] SSO response verification failed");
    return clearNonceCookie(
      NextResponse.json({ error: "Invalid SSO response" }, { status: 403 }),
    );
  }

  const nonceCookie = request.cookies.get(NONCE_COOKIE)?.value;
  if (!nonceCookie || !timingSafeEqualStrings(nonceCookie, ssoUser.nonce)) {
    console.error("[auth/callback] Nonce mismatch or missing nonce cookie");
    return clearNonceCookie(
      NextResponse.json({ error: "Invalid or expired nonce" }, { status: 403 }),
    );
  }

  try {
    const db = DatabaseManager.getInstance();
    await db.upsertUser({
      refoldUserId: ssoUser.refoldUserId,
      email: ssoUser.email,
      name: ssoUser.name || null,
      tier: ssoUser.tier,
      paid: ssoUser.paid,
    });

    // The SSO payload is fresh entitlement truth — stamp entCheckedAt now.
    const token = await createSessionToken({
      sub: String(ssoUser.refoldUserId),
      email: ssoUser.email,
      name: ssoUser.name,
      tier: ssoUser.tier,
      paid: ssoUser.paid,
      entCheckedAt: Date.now(),
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const response = NextResponse.redirect(new URL("/", appUrl));
    clearNonceCookie(response);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[auth/callback] Failed to establish session:", error);
    return clearNonceCookie(
      NextResponse.json(
        { error: "Failed to establish session" },
        { status: 500 },
      ),
    );
  }
}
