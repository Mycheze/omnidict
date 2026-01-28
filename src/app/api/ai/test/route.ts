import { NextRequest, NextResponse } from 'next/server';
import { createProvider, AIProviderType } from '@/lib/ai/providers';

/**
 * POST /api/ai/test
 * Test AI provider connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, apiKey, model } = body;

    if (!providerType) {
      return NextResponse.json(
        { success: false, error: 'Provider type is required' },
        { status: 400 }
      );
    }

    // For DeepSeek, we don't need an API key from the request
    const config = providerType === 'deepseek'
      ? { model: model || 'deepseek-chat', apiKey: '' }
      : { apiKey, model };

    if (!config.apiKey && providerType !== 'deepseek') {
      return NextResponse.json(
        { success: false, error: 'API key is required for non-DeepSeek providers' },
        { status: 400 }
      );
    }

    // Create provider and test connection
    const provider = createProvider(providerType as AIProviderType, config);
    const result = await provider.testConnection();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error testing provider:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
