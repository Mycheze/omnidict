import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  withSecurity,
  DEFAULT_SECURITY,
  RELAXED_SECURITY,
} from "@/lib/security/middleware";
import DatabaseManager from "@/lib/database";
import { ApiResponse, PendingAnkiCardRow } from "@/lib/types";
import {
  computeDedupKeyServer,
  exportContextSchema,
  getSessionUserId,
} from "./schema";

export const dynamic = "force-dynamic";

const enqueueSchema = z.object({
  context: exportContextSchema,
});

const deleteSchema = z.object({
  id: z.number().int().positive(),
});

/**
 * GET /api/anki-queue — list the signed-in user's pending cards (queued,
 * flushing, and error — everything not yet successfully exported).
 */
async function listHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const rows = await DatabaseManager.getInstance().listPendingCardsByUser(
    userId,
    ["queued", "flushing", "error"],
  );

  const response: ApiResponse<PendingAnkiCardRow[]> = {
    success: true,
    data: rows,
  };
  return NextResponse.json(response);
}

/**
 * POST /api/anki-queue — enqueue one card for later export. The dedup key is
 * computed server-side from the validated context, so duplicate submissions
 * of the same card are ignored (returns enqueued: false).
 */
async function enqueueHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = enqueueSchema.parse(await request.json());
  const dedupKey = computeDedupKeyServer(body.context);

  const enqueued = await DatabaseManager.getInstance().enqueuePendingCard(
    userId,
    dedupKey,
    JSON.stringify(body.context),
  );

  const response: ApiResponse<{ enqueued: boolean }> = {
    success: true,
    data: { enqueued },
    message: enqueued ? "Card queued" : "Card was already queued",
  };
  return NextResponse.json(response);
}

/**
 * DELETE /api/anki-queue — remove one of the user's pending cards. Cards
 * currently being flushed cannot be deleted (repository refuses).
 */
async function deleteHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = deleteSchema.parse(await request.json());
  const deleted = await DatabaseManager.getInstance().deletePendingCard(
    body.id,
    userId,
  );

  const response: ApiResponse<{ deleted: boolean }> = {
    success: true,
    data: { deleted },
  };
  return NextResponse.json(response);
}

export const GET = withSecurity(listHandler, RELAXED_SECURITY);
export const POST = withSecurity(enqueueHandler, DEFAULT_SECURITY);
export const DELETE = withSecurity(deleteHandler, DEFAULT_SECURITY);
