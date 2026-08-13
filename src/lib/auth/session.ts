import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

/**
 * Session token management for Omnidict auth (server-only).
 *
 * Sessions are HS256 JWTs signed with OMNIDICT_SESSION_SECRET and stored in
 * an httpOnly cookie. 30-day expiry; jose handles iat/exp internally.
 */

export const SESSION_COOKIE = "omnidict_session";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionClaims {
  /** Refold user id as a string (JWT subject) */
  sub: string;
  email: string;
  name: string;
  tier: string;
  paid: boolean;
  /** Epoch ms of the last successful entitlements check */
  entCheckedAt: number;
}

function getSecretKey(): Uint8Array | null {
  const secret = process.env.OMNIDICT_SESSION_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT. Throws when OMNIDICT_SESSION_SECRET is not configured.
 * `expiresInSeconds` is overridable for tests; defaults to 30 days.
 */
export async function createSessionToken(
  claims: SessionClaims,
  expiresInSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const key = getSecretKey();
  if (!key) {
    throw new Error("OMNIDICT_SESSION_SECRET is not configured");
  }

  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    email: claims.email,
    name: claims.name,
    tier: claims.tier,
    paid: claims.paid,
    entCheckedAt: claims.entCheckedAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(key);
}

/**
 * Verify a session JWT. Returns null on any failure (expired token, bad
 * signature, malformed claims, missing secret).
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  const key = getSecretKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    const { sub, email, name, tier, paid, entCheckedAt } = payload;
    if (
      typeof sub !== "string" ||
      typeof email !== "string" ||
      typeof name !== "string" ||
      typeof tier !== "string" ||
      typeof paid !== "boolean" ||
      typeof entCheckedAt !== "number"
    ) {
      return null;
    }

    return { sub, email, name, tier, paid, entCheckedAt };
  } catch {
    return null;
  }
}

/** Read and verify the session cookie from a request. */
export async function getSession(
  request: NextRequest,
): Promise<SessionClaims | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Cookie options for the session cookie. */
export function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
