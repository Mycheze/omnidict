import { NextRequest, NextResponse } from "next/server";
import { withSecurity, STRICT_SECURITY } from "@/lib/security/middleware";
import { LanguageSchema, WordSchema } from "@/lib/security/validation";
import {
  MediaService,
  computeQuotaRequest,
  currentUsagePeriod,
  getMediaQuotaLimits,
} from "@/lib/services/MediaService";
import {
  SESSION_COOKIE,
  SessionClaims,
  createSessionToken,
  getSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { fetchEntitlements } from "@/lib/auth/entitlements";
import DatabaseManager from "@/lib/database";
import {
  ApiResponse,
  IMAGE_STYLE_VALUES,
  MediaGenerationResult,
} from "@/lib/types";
import { z } from "zod";

const MediaGenerationSchema = z.object({
  types: z
    .array(z.enum(["image", "wordAudio", "sentenceAudio"]))
    .min(1)
    .max(3),
  headword: WordSchema,
  definition: z.string().max(2000).optional(),
  sentence: z.string().max(2000).optional(),
  targetLanguage: LanguageSchema,
  // User-supplied paid-API keys (only used when the session is not paid)
  apiKeys: z
    .object({
      elevenLabs: z.string().max(200).default(""),
      replicate: z.string().max(200).default(""),
    })
    .optional(),
  config: z.object({
    googleLanguageCode: z.string().max(20).default(""),
    googleVoiceName: z.string().max(100).default(""),
    elevenLabsVoiceId: z.string().max(100).default(""),
    elevenLabsLanguageCode: z.string().max(10).default(""),
    elevenLabsSpeed: z.number().min(0.7).max(1.2).default(0.85),
    imageStyle: z.enum(IMAGE_STYLE_VALUES).default("gothic"),
  }),
});

// Re-verify entitlements with Refold when the session's check is older than
// this before spending the server's API budget (tighter than the 24h TTL
// used for plain identity refresh in /api/auth/me)
const PAID_ENTITLEMENT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Response shape: standard ApiResponse plus `billing` so the client can tell
 * whether generation ran on the server's keys (paid quota) or the user's own.
 */
type MediaGenerationResponse = ApiResponse<MediaGenerationResult> & {
  billing: "server" | "user";
};

interface PaidCheckResult {
  paid: boolean;
  /** Set when claims changed and the session cookie should be reissued */
  reissueClaims: SessionClaims | null;
}

/**
 * Decide whether this request may spend the server's API keys. Paid sessions
 * with a stale entitlement check are re-verified against Refold; if that
 * verification FAILS the request is treated as not-paid (fail closed for
 * server-key spending) without logging the user out.
 */
async function checkPaidEntitlement(
  session: SessionClaims | null,
): Promise<PaidCheckResult> {
  if (!session?.paid) {
    return { paid: false, reissueClaims: null };
  }

  if (Date.now() - session.entCheckedAt <= PAID_ENTITLEMENT_TTL_MS) {
    return { paid: true, reissueClaims: null };
  }

  const refoldUserId = Number(session.sub);
  try {
    const entitlements = await fetchEntitlements(refoldUserId);
    const tier = entitlements.exists ? entitlements.tier : "free";
    const paid = entitlements.exists ? entitlements.paid : false;

    try {
      await DatabaseManager.getInstance().updateEntitlements(
        refoldUserId,
        tier,
        paid,
      );
    } catch (error) {
      console.error("[media/generate] Failed to persist entitlements:", error);
    }

    return {
      paid,
      reissueClaims: {
        sub: session.sub,
        email: session.email,
        name: session.name,
        tier,
        paid,
        entCheckedAt: Date.now(),
      },
    };
  } catch (error) {
    // Refold unreachable — don't spend server money on stale claims, but
    // keep the session intact (the user stays logged in).
    console.error(
      "[media/generate] Entitlement re-check failed, treating as not paid:",
      error,
    );
    return { paid: false, reissueClaims: null };
  }
}

/** Attach a reissued session cookie when the entitlement check updated claims */
async function withSessionCookie(
  response: NextResponse,
  reissueClaims: SessionClaims | null,
): Promise<NextResponse> {
  if (reissueClaims) {
    try {
      const token = await createSessionToken(reissueClaims);
      response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    } catch (error) {
      console.error("[media/generate] Failed to reissue session:", error);
    }
  }
  return response;
}

async function mediaGenerateHandler(request: NextRequest) {
  const rawBody = await request.json();
  const params = MediaGenerationSchema.parse(rawBody);

  const session = await getSession(request);
  const { paid, reissueClaims } = await checkPaidEntitlement(session);

  const mediaService = MediaService.getInstance();

  // Anonymous / free users: their own keys only (never the server's)
  if (!paid || !session) {
    const result = await mediaService.generate({
      ...params,
      useServerKeys: false,
    });
    const response: MediaGenerationResponse = {
      success: true,
      data: result,
      billing: "user",
    };
    return withSessionCookie(NextResponse.json(response), reissueClaims);
  }

  // Paid users: server keys, gated by monthly quotas
  const refoldUserId = Number(session.sub);
  const period = currentUsagePeriod();
  const limits = getMediaQuotaLimits();
  const { imagesReq, ttsReq } = computeQuotaRequest(params.types);

  const db = DatabaseManager.getInstance();
  let consumed = false;

  if (imagesReq > 0 || ttsReq > 0) {
    consumed = await db.tryConsumeQuota(
      refoldUserId,
      period,
      imagesReq,
      ttsReq,
      limits,
    );
    if (!consumed) {
      const usage = await db.getUsage(refoldUserId, period);
      const response = NextResponse.json(
        {
          success: false,
          code: "QUOTA_EXCEEDED",
          error: "Monthly media generation quota exceeded",
          usage: {
            images: usage?.images_used ?? 0,
            tts: usage?.tts_used ?? 0,
          },
          limits: { images: limits.imageLimit, tts: limits.ttsLimit },
        },
        { status: 403 },
      );
      return withSessionCookie(response, reissueClaims);
    }
  }

  const result = await mediaService.generate({
    ...params,
    useServerKeys: true,
  });

  // Nothing was produced at all — hand the quota back (best effort)
  const allFailed = params.types.every((type) => result.errors?.[type]);
  if (consumed && allFailed) {
    try {
      await db.refundQuota(refoldUserId, period, imagesReq, ttsReq);
    } catch (error) {
      console.error("[media/generate] Quota refund failed:", error);
    }
  }

  const response: MediaGenerationResponse = {
    success: true,
    data: result,
    billing: "server",
  };
  return withSessionCookie(NextResponse.json(response), reissueClaims);
}

// Media generation hits paid third-party APIs — keep the strict rate limit
export const POST = withSecurity(mediaGenerateHandler, STRICT_SECURITY);
