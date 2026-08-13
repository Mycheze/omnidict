import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  withSecurity,
  DEFAULT_SECURITY,
  RELAXED_SECURITY,
} from "@/lib/security/middleware";
import { getSession } from "@/lib/auth/session";
import { containsForbiddenKey } from "@/lib/sync/forbiddenKeys";
import DatabaseManager from "@/lib/database";

export const dynamic = "force-dynamic";

/** Hard cap on the raw request body for PUT (64KB). */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Structural validation of the sync envelope. The four sections must be
 * present as objects; inner keys are intentionally loose so older/newer
 * clients can round-trip payloads (applySyncedSettings validates each field
 * on the way back in). Unknown top-level keys are stripped by zod.
 */
const envelopeSchema = z.object({
  version: z.literal(1),
  settings: z.object({
    general: z.record(z.unknown()),
    ai: z.record(z.unknown()),
    media: z.record(z.unknown()),
    anki: z.record(z.unknown()),
  }),
});

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Authentication required" },
    { status: 401 },
  );
}

/**
 * GET /api/user/settings
 *
 * Returns the signed-in user's synced settings envelope, or nulls when the
 * user has never pushed settings (the client seeds them on first login).
 */
async function getHandler(request: NextRequest): Promise<NextResponse> {
  const claims = await getSession(request);
  if (!claims) return unauthorized();

  const row = await DatabaseManager.getInstance().getSettings(
    Number(claims.sub),
  );
  if (!row) {
    return NextResponse.json({ settings: null, updatedAt: null });
  }

  let settings: unknown = null;
  try {
    settings = JSON.parse(row.settingsJson);
  } catch {
    // Corrupted row — treat as absent so the client re-seeds it.
    return NextResponse.json({ settings: null, updatedAt: null });
  }

  return NextResponse.json({ settings, updatedAt: row.updatedAt });
}

/**
 * PUT /api/user/settings
 *
 * Validates and stores the synced settings envelope for the signed-in user.
 */
async function putHandler(request: NextRequest): Promise<NextResponse> {
  const claims = await getSession(request);
  if (!claims) return unauthorized();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: "Settings payload too large" },
      { status: 413 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Checked against the raw parse (pre-strip) so a credential anywhere in
  // the payload rejects the request even if zod would have dropped it.
  if (containsForbiddenKey(parsed)) {
    return NextResponse.json(
      { success: false, error: "Settings must not contain API keys" },
      { status: 400 },
    );
  }

  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: "Invalid settings payload" },
      { status: 400 },
    );
  }

  await DatabaseManager.getInstance().putSettings(
    Number(claims.sub),
    JSON.stringify(result.data),
  );

  return NextResponse.json({ success: true });
}

export const GET = withSecurity(getHandler, RELAXED_SECURITY);
export const PUT = withSecurity(putHandler, DEFAULT_SECURITY);
