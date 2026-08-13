import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import DatabaseManager from "@/lib/database";
import { ApiResponse } from "@/lib/types";
import { getSessionUserId, userOwnsPendingCard } from "../schema";

export const dynamic = "force-dynamic";

const completeSchema = z.object({
  id: z.number().int().positive(),
  outcome: z.enum(["done", "error", "released"]),
  ankiNoteId: z.number().int().optional(),
  error: z.string().max(2000).optional(),
  /** Generated media field values (img/sound tags) to persist for retries */
  mediaValues: z
    .record(
      z.enum(["image", "wordAudio", "sentenceAudio"]),
      z.string().max(2000),
    )
    .optional(),
});

/**
 * POST /api/anki-queue/complete — report the outcome of a flush attempt for
 * a claimed card. `mediaValues` (when present) is saved regardless of
 * outcome so already-paid-for media isn't regenerated on retry.
 */
async function completeHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = completeSchema.parse(await request.json());

  if (!(await userOwnsPendingCard(userId, body.id))) {
    return NextResponse.json(
      { success: false, error: "Card not found" },
      { status: 404 },
    );
  }

  const db = DatabaseManager.getInstance();

  if (body.mediaValues && Object.keys(body.mediaValues).length > 0) {
    await db.savePendingCardMediaValues(
      body.id,
      JSON.stringify(body.mediaValues),
    );
  }

  switch (body.outcome) {
    case "done":
      await db.markPendingCardDone(body.id, body.ankiNoteId ?? null);
      break;
    case "error":
      await db.markPendingCardError(body.id, body.error || "Unknown error");
      break;
    case "released":
      await db.releasePendingCard(body.id);
      break;
    default:
      return NextResponse.json(
        { success: false, error: "Unknown outcome" },
        { status: 400 },
      );
  }

  const response: ApiResponse<{ outcome: string }> = {
    success: true,
    data: { outcome: body.outcome },
  };
  return NextResponse.json(response);
}

export const POST = withSecurity(completeHandler, DEFAULT_SECURITY);
