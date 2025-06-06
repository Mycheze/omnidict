import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, DEFAULT_SECURITY } from '@/lib/security/middleware';
import { validateSearchRequest } from '@/lib/security/validation';
import { DictionaryService } from '@/lib/services/DictionaryService';
import { ApiResponse, SearchResult } from '@/lib/types';

async function searchEntriesHandler(request: NextRequest) {
  // Handle empty request bodies gracefully
  let requestBody;
  try {
    const bodyText = await request.text();
    if (!bodyText || bodyText.trim() === '') {
      requestBody = { filters: {}, page: 1, pageSize: 50 };
    } else {
      requestBody = JSON.parse(bodyText);
    }
  } catch (jsonError) {
    console.error('JSON parsing error:', jsonError);
    requestBody = { filters: {}, page: 1, pageSize: 50 };
  }

  // Validate and sanitize input
  const { filters, page, pageSize } = validateSearchRequest(requestBody);

  console.log('Search request:', { filters, page, pageSize });

  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.searchEntries(filters, page, pageSize);

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Search failed',
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse<SearchResult> = {
      success: true,
      data: result.result!,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in searchEntriesHandler:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(searchEntriesHandler, {
  ...DEFAULT_SECURITY,
  rateLimit: { maxRequests: 200, windowMs: 60000 }, // More generous for search
});