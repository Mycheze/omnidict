import { NextRequest, NextResponse } from "next/server";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import AIManager from "@/lib/ai";
import { ApiResponse, LemmaRequest, LemmaResponse } from "@/lib/types";

async function lemmaHandler(request: NextRequest) {
  const { word, targetLanguage }: LemmaRequest = await request.json();

  if (!word || !targetLanguage) {
    const response: ApiResponse = {
      success: false,
      error: "Word and target language are required",
    };
    return NextResponse.json(response, { status: 400 });
  }

  const ai = AIManager.getInstance();
  const result = await ai.getLemma({ word, targetLanguage });

  const response: ApiResponse<LemmaResponse> = {
    success: true,
    data: result,
  };

  return NextResponse.json(response);
}

export const POST = withSecurity(lemmaHandler, DEFAULT_SECURITY);
