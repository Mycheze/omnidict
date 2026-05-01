import { NextRequest, NextResponse } from "next/server";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import { validateEntryRequest, sanitizeError } from "@/lib/security/validation";
import { DictionaryService } from "@/lib/services/DictionaryService";

/**
 * POST /api/dictionary
 * Main endpoint to create dictionary entries with AI provider configuration
 */
async function dictionaryHandler(request: NextRequest) {
  const rawBody = await request.json();
  const {
    word,
    sourceLanguage,
    targetLanguage,
    contextSentence,
    providerType,
    apiKey,
    model,
  } = validateEntryRequest(rawBody);

  const service = DictionaryService.getInstance();

  try {
    const result = await service.createEntry(
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence,
      providerType ? { providerType, apiKey, model } : undefined,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error creating dictionary entry:", error);
    return NextResponse.json(
      {
        success: false,
        error: sanitizeError(error),
      },
      { status: 500 },
    );
  }
}

// Export the secured handler
export const POST = withSecurity(dictionaryHandler, {
  ...DEFAULT_SECURITY,
  rateLimit: { maxRequests: 50, windowMs: 60000 },
});
