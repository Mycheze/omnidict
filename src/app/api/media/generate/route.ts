import { NextRequest, NextResponse } from "next/server";
import { withSecurity, STRICT_SECURITY } from "@/lib/security/middleware";
import { LanguageSchema, WordSchema } from "@/lib/security/validation";
import { MediaService } from "@/lib/services/MediaService";
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
  // Paid-API keys are user-supplied from settings (env vars are the fallback)
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

async function mediaGenerateHandler(request: NextRequest) {
  const rawBody = await request.json();
  const params = MediaGenerationSchema.parse(rawBody);

  const mediaService = MediaService.getInstance();
  const result = await mediaService.generate(params);

  const response: ApiResponse<MediaGenerationResult> = {
    success: true,
    data: result,
  };

  return NextResponse.json(response);
}

// Media generation hits paid third-party APIs — keep the strict rate limit
export const POST = withSecurity(mediaGenerateHandler, STRICT_SECURITY);
