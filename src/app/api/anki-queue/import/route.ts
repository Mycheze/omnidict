import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import DatabaseManager from "@/lib/database";
import { ApiResponse } from "@/lib/types";
import {
  computeDedupKeyServer,
  exportContextSchema,
  getSessionUserId,
} from "../schema";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  cards: z
    .array(z.object({ context: exportContextSchema }))
    .min(1)
    .max(500),
});

/**
 * POST /api/anki-queue/import — bulk-import an anonymous device's local
 * queue into the signed-in user's server queue (runs once after login).
 * Duplicates (same dedup key) are ignored; returns how many were inserted.
 */
async function importHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = importSchema.parse(await request.json());

  const cards = body.cards.map(({ context }) => ({
    dedupKey: computeDedupKeyServer(context),
    contextJson: JSON.stringify(context),
  }));

  const imported = await DatabaseManager.getInstance().enqueuePendingCards(
    userId,
    cards,
  );

  const response: ApiResponse<{ imported: number }> = {
    success: true,
    data: { imported },
    message: `Imported ${imported} of ${cards.length} cards`,
  };
  return NextResponse.json(response);
}

export const POST = withSecurity(importHandler, DEFAULT_SECURITY);
