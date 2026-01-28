import { DictionaryService } from '@/lib/services/DictionaryService';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/dictionary
 * Main endpoint to create dictionary entries with AI provider configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence,
      providerType,
      apiKey,
      model,
    } = body;

    if (!word || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const service = DictionaryService.getInstance();

    // Configure AI provider if specified
    if (providerType) {
      service.configureAI(providerType, apiKey, model);
    }

    const result = await service.createEntry(
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating dictionary entry:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
