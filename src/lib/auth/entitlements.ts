import { normalizeTier } from "./sso";

/**
 * Server-to-server entitlements lookup against the Refold platform.
 *
 * POST ${REFOLD_BASE_URL}/api/omnidict/entitlements with
 * Authorization: Bearer OMNIDICT_API_SECRET and body {userId:number}.
 * Response: {userId, exists, tier, paid:boolean, email} (exists:false when
 * the user is gone).
 */

export interface EntitlementsResult {
  exists: boolean;
  tier: string;
  paid: boolean;
}

const FETCH_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Fetch current entitlements for a Refold user.
 * Throws on network failure, timeout, non-2xx response, or malformed body,
 * so callers can choose between serving stale claims and failing closed.
 */
export async function fetchEntitlements(
  refoldUserId: number,
): Promise<EntitlementsResult> {
  const baseUrl = process.env.REFOLD_BASE_URL;
  const secret = process.env.OMNIDICT_API_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("REFOLD_BASE_URL or OMNIDICT_API_SECRET is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/omnidict/entitlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ userId: refoldUserId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Entitlements request failed with status ${response.status}`,
      );
    }

    const body: unknown = await response.json();
    if (!isRecord(body) || typeof body.exists !== "boolean") {
      throw new Error("Malformed entitlements response");
    }

    if (!body.exists) {
      return { exists: false, tier: "free", paid: false };
    }

    if (typeof body.tier !== "string" || typeof body.paid !== "boolean") {
      throw new Error("Malformed entitlements response");
    }

    return {
      exists: true,
      tier: normalizeTier(body.tier),
      paid: body.paid,
    };
  } finally {
    clearTimeout(timeout);
  }
}
