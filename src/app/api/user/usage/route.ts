import { NextRequest, NextResponse } from "next/server";
import { withSecurity, RELAXED_SECURITY } from "@/lib/security/middleware";
import { getSession } from "@/lib/auth/session";
import {
  currentUsagePeriod,
  getMediaQuotaLimits,
} from "@/lib/services/MediaService";
import DatabaseManager from "@/lib/database";
import { ApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface MediaUsageSummary {
  period: string;
  images: { used: number; limit: number };
  tts: { used: number; limit: number };
}

/**
 * GET /api/user/usage
 *
 * Current-month media generation usage for the signed-in user. 401 without a
 * session; zeros when the user has not generated anything this period.
 */
async function usageHandler(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  const period = currentUsagePeriod();
  const limits = getMediaQuotaLimits();
  const usage = await DatabaseManager.getInstance().getUsage(
    Number(session.sub),
    period,
  );

  const response: ApiResponse<MediaUsageSummary> = {
    success: true,
    data: {
      period,
      images: { used: usage?.images_used ?? 0, limit: limits.imageLimit },
      tts: { used: usage?.tts_used ?? 0, limit: limits.ttsLimit },
    },
  };
  return NextResponse.json(response);
}

export const GET = withSecurity(usageHandler, RELAXED_SECURITY);
