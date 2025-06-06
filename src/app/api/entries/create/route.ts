import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, DEFAULT_SECURITY } from '@/lib/security/middleware';
import { validateEntryRequest } from '@/lib/security/validation';
import { DictionaryService } from '@/lib/services/DictionaryService';
import { ApiResponse, DictionaryEntry } from '@/lib/types';

async function createEntryHandler(request: NextRequest) {
  // Validate and sanitize input
  const rawBody = await request.json();
  const { word, sourceLanguage, targetLanguage, contextSentence } = validateEntryRequest(rawBody);

  console.log('Creating entry for:', word, `(${sourceLanguage} → ${targetLanguage})`, 
              contextSentence ? 'with context' : 'without context');

  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.createEntry(
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence
    );

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Failed to create entry',
      };
      return NextResponse.json(response, { status: 500 });
    }

    console.log('Entry created successfully:', result.entry?.headword, 
                result.entry?.metadata.has_context ? '(context-aware)' : '(standard)');

    const response: ApiResponse<DictionaryEntry> = {
      success: true,
      data: result.entry!,
      message: result.entry?.metadata.has_context ? 
        'Context-aware entry created successfully' : 
        'Entry created successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in createEntryHandler:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(createEntryHandler, {
  ...DEFAULT_SECURITY,
  rateLimit: { maxRequests: 50, windowMs: 60000 }, // Stricter for creation
});