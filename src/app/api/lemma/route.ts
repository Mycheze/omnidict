import { NextRequest, NextResponse } from 'next/server';
import AIManager from '@/lib/ai';
import { ApiResponse, LemmaRequest, LemmaResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { word, targetLanguage }: LemmaRequest = await request.json();

    if (!word || !targetLanguage) {
      const response: ApiResponse = {
        success: false,
        error: 'Word and target language are required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    console.log('Getting lemma for:', word, 'in', targetLanguage);

    const ai = AIManager.getInstance();
    const result = await ai.getLemma({ word, targetLanguage });

    const response: ApiResponse<LemmaResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in lemma API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get lemma',
    };

    return NextResponse.json(response, { status: 500 });
  }
}