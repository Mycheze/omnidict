import { NextRequest, NextResponse } from "next/server";
import { withSecurity, RELAXED_SECURITY } from "@/lib/security/middleware";
import { ApiResponse, MediaProviderStatus } from "@/lib/types";

/**
 * Report which media provider API keys are configured server-side,
 * so the settings UI can show what will actually work.
 */
async function mediaStatusHandler(_request: NextRequest) {
  const response: ApiResponse<MediaProviderStatus> = {
    success: true,
    data: {
      googleTts: Boolean(process.env.GOOGLE_TTS_API_KEY),
      elevenLabs: Boolean(process.env.ELEVENLABS_API_KEY),
      replicate: Boolean(process.env.REPLICATE_API_TOKEN),
    },
  };

  return NextResponse.json(response);
}

export const GET = withSecurity(mediaStatusHandler, RELAXED_SECURITY);
