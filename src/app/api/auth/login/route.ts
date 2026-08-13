import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildSsoRequest } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "omnidict_sso_nonce";

/**
 * GET /api/auth/login
 *
 * Starts the Refold SSO flow: generates a nonce, stores it in a short-lived
 * httpOnly cookie, and redirects the browser to the Refold SSO endpoint with
 * a signed payload. Refold redirects back to /api/auth/callback.
 */
export async function GET(_request: NextRequest) {
  const refoldBaseUrl = process.env.REFOLD_BASE_URL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!refoldBaseUrl || !appUrl || !process.env.OMNIDICT_SSO_SECRET) {
    console.error("[auth/login] Missing SSO configuration");
    return NextResponse.json(
      { error: "SSO is not configured" },
      { status: 500 },
    );
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const { payload, sig } = buildSsoRequest(
    nonce,
    `${appUrl}/api/auth/callback`,
  );

  const redirectUrl = `${refoldBaseUrl}/api/omnidict/sso?payload=${encodeURIComponent(payload)}&sig=${sig}`;

  const response = NextResponse.redirect(redirectUrl, 302);
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — enough to complete the SSO round-trip
  });
  return response;
}
