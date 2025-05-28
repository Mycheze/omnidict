import { NextRequest, NextResponse } from 'next/server';
import AIManager from '@/lib/ai';
import { ApiResponse, LanguageValidationRequest, LanguageValidationResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { inputLanguage }: LanguageValidationRequest = await request.json();

    if (!inputLanguage || !inputLanguage.trim()) {
      const response: ApiResponse = {
        success: false,
        error: 'Language input is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    console.log('Validating language:', inputLanguage);

    const ai = AIManager.getInstance();
    const result = await ai.validateLanguage(inputLanguage.trim());

    console.log('Language validation result:', result);

    const response: ApiResponse<LanguageValidationResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in language validation API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate language',
    };

    return NextResponse.json(response, { status: 500 });
  }
}