import crypto from "node:crypto";

/**
 * SSO wire-format helpers for the Refold <-> Omnidict handshake.
 *
 * Server-only: uses node:crypto and reads OMNIDICT_SSO_SECRET.
 *
 * Request (Omnidict -> Refold):
 *   payload = base64(URLSearchParams "nonce=..&return_url=..")
 *   sig     = hex HMAC-SHA256 over the base64 string
 * Response (Refold -> Omnidict):
 *   payload = base64(URLSearchParams "nonce&external_id&email&name&tier&paid")
 *   sig     = hex HMAC-SHA256 over the base64 string
 */

const KNOWN_TIERS = new Set(["free", "toolkit", "all-access", "coaching"]);

export interface SsoUser {
  nonce: string;
  refoldUserId: number;
  email: string;
  name: string;
  tier: string;
  paid: boolean;
}

/** Validate a tier value from the wire, defaulting to "free" for unknowns. */
export function normalizeTier(tier: string | null | undefined): string {
  return tier && KNOWN_TIERS.has(tier) ? tier : "free";
}

/** Constant-time string comparison (length-guarded). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function hmacHex(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Build the signed request payload that starts the SSO flow.
 * Throws when OMNIDICT_SSO_SECRET is not configured.
 */
export function buildSsoRequest(
  nonce: string,
  returnUrl: string,
): { payload: string; sig: string } {
  const secret = process.env.OMNIDICT_SSO_SECRET;
  if (!secret) {
    throw new Error("OMNIDICT_SSO_SECRET is not configured");
  }

  const payload = Buffer.from(
    new URLSearchParams({ nonce, return_url: returnUrl }).toString(),
  ).toString("base64");
  const sig = hmacHex(secret, payload);

  return { payload, sig };
}

/**
 * Verify and parse the signed response payload Refold redirects back with.
 * Returns null on any failure (bad signature, malformed payload, bad fields).
 */
export function verifySsoResponse(
  payload: string,
  sig: string,
): SsoUser | null {
  try {
    const secret = process.env.OMNIDICT_SSO_SECRET;
    if (!secret) return null;

    const expectedSig = hmacHex(secret, payload);
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const params = new URLSearchParams(decoded);

    const nonce = params.get("nonce");
    const externalId = params.get("external_id");
    const email = params.get("email");
    const name = params.get("name");
    const paidRaw = params.get("paid");

    if (!nonce || !externalId || !email) return null;
    if (!/^\d+$/.test(externalId)) return null;
    const refoldUserId = Number.parseInt(externalId, 10);
    if (!Number.isSafeInteger(refoldUserId) || refoldUserId <= 0) return null;
    if (paidRaw !== "1" && paidRaw !== "0") return null;

    return {
      nonce,
      refoldUserId,
      email,
      name: name ?? "",
      tier: normalizeTier(params.get("tier")),
      paid: paidRaw === "1",
    };
  } catch {
    return null;
  }
}
