import { NextRequest, NextResponse } from 'next/server';
import { PROVIDER_METADATA, AIProviderType } from '@/lib/ai/providers/metadata';

/**
 * GET /api/ai/models?provider=<providerType>
 * Get available models for a provider
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider') as AIProviderType;

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider parameter is required' },
        { status: 400 }
      );
    }

    const metadata = PROVIDER_METADATA[provider];
    
    if (!metadata) {
      return NextResponse.json(
        { error: 'Invalid provider type' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      provider: metadata.id,
      models: metadata.models,
    });
  } catch (error) {
    console.error('Error getting models:', error);
    return NextResponse.json(
      { error: 'Failed to get models' },
      { status: 500 }
    );
  }
}
