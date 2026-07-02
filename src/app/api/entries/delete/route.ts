import { NextRequest, NextResponse } from "next/server";
import { withSecurity, STRICT_SECURITY } from "@/lib/security/middleware";
import { WordSchema, LanguageSchema } from "@/lib/security/validation";
import { DictionaryService } from "@/lib/services/DictionaryService";
import { ApiResponse } from "@/lib/types";
import { z } from "zod";

const DeleteRequestSchema = z.object({
  headword: WordSchema,
  sourceLanguage: LanguageSchema,
  targetLanguage: LanguageSchema,
});

async function deleteEntryHandler(request: NextRequest) {
  const rawBody = await request.json();
  const { headword, sourceLanguage, targetLanguage } =
    DeleteRequestSchema.parse(rawBody);

  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.deleteEntry(
      headword,
      sourceLanguage,
      targetLanguage,
    );

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || "Entry not found or failed to delete",
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse = {
      success: true,
      message: "Entry deleted successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in deleteEntryHandler:", error);

    const response: ApiResponse = {
      success: false,
      error: "Internal server error",
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const DELETE = withSecurity(deleteEntryHandler, STRICT_SECURITY);
