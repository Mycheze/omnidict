import { NextRequest, NextResponse } from "next/server";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import { WordSchema, LanguageSchema } from "@/lib/security/validation";
import AIManager from "@/lib/ai";
import { ApiResponse, LemmaResponse } from "@/lib/types";
import { z } from "zod";

const LemmaRequestSchema = z.object({
  word: WordSchema,
  targetLanguage: LanguageSchema,
});

async function lemmaHandler(request: NextRequest) {
  const rawBody = await request.json();
  const { word, targetLanguage } = LemmaRequestSchema.parse(rawBody);

  const ai = AIManager.getInstance();
  const result = await ai.getLemma({ word, targetLanguage });

  const response: ApiResponse<LemmaResponse> = {
    success: true,
    data: result,
  };

  return NextResponse.json(response);
}

export const POST = withSecurity(lemmaHandler, DEFAULT_SECURITY);
