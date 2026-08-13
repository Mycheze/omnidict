import { NextRequest, NextResponse } from "next/server";
import { withSecurity, RELAXED_SECURITY } from "@/lib/security/middleware";
import {
  SESSION_COOKIE,
  SessionClaims,
  createSessionToken,
  getSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { fetchEntitlements } from "@/lib/auth/entitlements";
import DatabaseManager from "@/lib/database";

export const dynamic = "force-dynamic";

const ENTITLEMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/auth/me
 *
 * Returns the current user from the session cookie, or {user:null} when not
 * signed in. When the session's entitlement check is older than 24h, refresh
 * tier/paid from Refold (serving stale claims if the refresh fails) and
 * reissue the session cookie with the fresh values.
 */
async function meHandler(request: NextRequest) {
  const claims = await getSession(request);
  if (!claims) {
    return NextResponse.json({ user: null });
  }

  const refoldUserId = Number(claims.sub);
  let { tier, paid, entCheckedAt } = claims;
  let refreshed = false;

  if (Date.now() - entCheckedAt > ENTITLEMENT_TTL_MS) {
    try {
      const entitlements = await fetchEntitlements(refoldUserId);
      // exists:false ⇒ user gone on the Refold side — drop to free/unpaid
      // but keep the identity so the session stays usable.
      tier = entitlements.exists ? entitlements.tier : "free";
      paid = entitlements.exists ? entitlements.paid : false;
      entCheckedAt = Date.now();
      refreshed = true;

      try {
        await DatabaseManager.getInstance().updateEntitlements(
          refoldUserId,
          tier,
          paid,
        );
      } catch (error) {
        console.error("[auth/me] Failed to persist entitlements:", error);
      }
    } catch (error) {
      // Refold unreachable — serve stale claims unchanged.
      console.error(
        "[auth/me] Entitlement refresh failed, serving stale:",
        error,
      );
    }
  }

  const response = NextResponse.json({
    user: {
      refoldUserId,
      email: claims.email,
      name: claims.name,
      tier,
      paid,
    },
  });

  if (refreshed) {
    const newClaims: SessionClaims = {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      tier,
      paid,
      entCheckedAt,
    };
    const token = await createSessionToken(newClaims);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  }

  return response;
}

export const GET = withSecurity(meHandler, RELAXED_SECURITY);
