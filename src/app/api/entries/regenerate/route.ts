import { NextRequest, NextResponse } from "next/server";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";
import {
  WordSchema,
  LanguageSchema,
  sanitizeError,
} from "@/lib/security/validation";
import { DictionaryService } from "@/lib/services/DictionaryService";
import { ApiResponse, DictionaryEntry } from "@/lib/types";
import { z } from "zod";

const RegenerateRequestSchema = z.object({
  headword: WordSchema,
  sourceLanguage: LanguageSchema,
  targetLanguage: LanguageSchema,
  providerType: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

async function regenerateEntryHandler(request: NextRequest) {
  const rawBody = await request.json();
  const {
    headword,
    sourceLanguage,
    targetLanguage,
    providerType,
    apiKey,
    model,
  } = RegenerateRequestSchema.parse(rawBody);

  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.regenerateEntry(
      headword,
      sourceLanguage,
      targetLanguage,
      providerType ? { providerType, apiKey, model } : undefined,
    );

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || "Failed to regenerate entry",
      };
      const status = result.error === "Entry not found" ? 404 : 500;
      return NextResponse.json(response, { status });
    }

    if (!result.entry) {
      return NextResponse.json(
        {
          success: false,
          error: "Entry was regenerated but could not be retrieved",
        },
        { status: 500 },
      );
    }

    const response: ApiResponse<DictionaryEntry> = {
      success: true,
      data: result.entry,
      message: "Entry regenerated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in regenerateEntryHandler:", error);

    const response: ApiResponse = {
      success: false,
      error: sanitizeError(error),
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(regenerateEntryHandler, DEFAULT_SECURITY);
