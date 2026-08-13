import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import DatabaseManager from "@/lib/database";
import { ExportContext } from "@/lib/types";

/**
 * Shared validation + helpers for the /api/anki-queue routes. Colocated here
 * (non-route file) so route.ts, claim, complete, and import all validate the
 * same shapes.
 */

export const exportContextSchema = z.object({
  headword: z.string().min(1).max(500),
  definition: z.string().max(5000),
  partOfSpeech: z.union([
    z.string().max(200),
    z.array(z.string().max(200)).max(20),
  ]),
  example: z.string().max(5000),
  translation: z.string().max(5000).optional(),
  targetLanguage: z.string().max(100).optional(),
});

/**
 * Server-side twin of the client's computeDedupKey (exportCard.ts): SHA-256
 * hex over the same `headword|definition|example|targetLanguage` string.
 * Computed here so the server never trusts a client-supplied dedup key.
 */
export function computeDedupKeyServer(context: ExportContext): string {
  const input = [
    context.headword,
    context.definition,
    context.example,
    context.targetLanguage ?? "",
  ].join("|");

  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Resolve the numeric Refold user id from the session cookie, or null when
 * not signed in (callers turn null into a 401).
 */
export async function getSessionUserId(
  request: NextRequest,
): Promise<number | null> {
  const claims = await getSession(request);
  if (!claims) {
    return null;
  }
  const refoldUserId = Number(claims.sub);
  return Number.isFinite(refoldUserId) ? refoldUserId : null;
}

/**
 * Ownership check for claim/complete: the card id must be one of this
 * user's not-yet-done cards. Prevents one user driving state transitions on
 * another user's rows (mark/claim/release queries are id-only).
 */
export async function userOwnsPendingCard(
  userId: number,
  cardId: number,
): Promise<boolean> {
  const rows = await DatabaseManager.getInstance().listPendingCardsByUser(
    userId,
    ["queued", "flushing", "error"],
  );
  return rows.some((row) => row.id === cardId);
}
