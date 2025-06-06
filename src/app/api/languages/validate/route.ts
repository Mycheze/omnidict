import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, DEFAULT_SECURITY } from '@/lib/security/middleware';
import { validateLanguageRequest } from '@/lib/security/validation';
import { DictionaryService } from '@/lib/services/DictionaryService';
import { ApiResponse, LanguageValidationResponse } from '@/lib/types';

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

  console.log('Validating language:', inputLanguage);

  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.validateLanguage(inputLanguage.trim());

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Language validation failed',
      };
      return NextResponse.json(response, { status: 500 });
    }

    console.log('Language validation result:', result.result);

    const response: ApiResponse<LanguageValidationResponse> = {
      success: true,
      data: result.result!,
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