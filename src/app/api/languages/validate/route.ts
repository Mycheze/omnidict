import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, DEFAULT_SECURITY } from '@/lib/security/middleware';
import { validateLanguageRequest } from '@/lib/security/validation';
import { ApiResponse, LanguageValidationResponse } from '@/lib/types';
import languages from '@/lib/languages.json';

async function validateLanguageHandler(request: NextRequest) {
  // Validate and sanitize input
  const rawBody = await request.json();
  const { inputLanguage } = validateLanguageRequest(rawBody);

  if (!inputLanguage || !inputLanguage.trim()) {
    const response: ApiResponse = {
      success: false,
      error: 'Language input is required',
    };
    return NextResponse.json(response, { status: 400 });
  }

  const query = inputLanguage.trim().toLowerCase();
  console.log('Validating language against static list:', inputLanguage);

  try {
    // Find matching language
    // We check against name (lowercase) or code (lowercase)
    const match = languages.find(lang => 
      lang.name.toLowerCase() === query || 
      lang.code.toLowerCase() === query
    );

    if (!match) {
      const response: ApiResponse = {
        success: false,
        error: `Language "${inputLanguage}" not found in supported list.`,
      };
      return NextResponse.json(response, { status: 404 });
    }

    console.log('Language found:', match.name);

    const result: LanguageValidationResponse = {
      standardizedName: match.name,
      displayName: match.name, // Default display name is the standardized name
    };

    const response: ApiResponse<LanguageValidationResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in validateLanguageHandler:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(validateLanguageHandler, {
  ...DEFAULT_SECURITY,
  rateLimit: { maxRequests: 30, windowMs: 60000 }, // Stricter for AI validation
});