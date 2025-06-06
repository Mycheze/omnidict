import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import { SearchFilters, ApiResponse, SearchResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    let requestBody: { 
      filters?: SearchFilters; 
      page?: number; 
      pageSize?: number; 
    };

    // FIXED: Handle empty request bodies gracefully
    try {
      const bodyText = await request.text();
      if (!bodyText || bodyText.trim() === '') {
        // Empty body, use defaults
        requestBody = { filters: {}, page: 1, pageSize: 50 };
      } else {
        requestBody = JSON.parse(bodyText);
      }
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      // Invalid JSON, use defaults
      requestBody = { filters: {}, page: 1, pageSize: 50 };
    }

    // Extract with defaults
    const { 
      filters = {}, 
      page = 1, 
      pageSize = 50 
    } = requestBody;

    console.log('Search request:', { filters, page, pageSize });

    const db = DatabaseManager.getInstance();
    const results = await db.searchEntries(filters, page, pageSize);

    const response: ApiResponse<SearchResult> = {
      success: true,
      data: results,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries search API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search entries',
    };

    return NextResponse.json(response, { status: 500 });
  }
}