import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import DatabaseManager from "@/lib/database";
import { ApiResponse } from "@/lib/types";
import { getSessionUserId, userOwnsPendingCard } from "../schema";

export const dynamic = "force-dynamic";

const claimSchema = z.object({
  id: z.number().int().positive(),
  sessionId: z.string().min(1).max(100),
});

/**
 * POST /api/anki-queue/claim — try to claim a card for flushing from this
 * browser tab. Returns claimed: false when another flusher holds a live
 * claim (stale claims older than 10 minutes can be stolen).
 */
async function claimHandler(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (userId === null) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = claimSchema.parse(await request.json());

  if (!(await userOwnsPendingCard(userId, body.id))) {
    return NextResponse.json(
      { success: false, error: "Card not found" },
      { status: 404 },
    );
  }

  const claimed = await DatabaseManager.getInstance().claimPendingCard(
    body.id,
    body.sessionId,
  );

  const response: ApiResponse<{ claimed: boolean }> = {
    success: true,
    data: { claimed },
  };
  return NextResponse.json(response);
}

export const POST = withSecurity(claimHandler, DEFAULT_SECURITY);
