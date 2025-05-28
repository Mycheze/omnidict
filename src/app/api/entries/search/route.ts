import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import { SearchFilters, ApiResponse, SearchResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { filters, page = 1, pageSize = 50 }: { 
      filters: SearchFilters; 
      page?: number; 
      pageSize?: number; 
    } = await request.json();

    const db = DatabaseManager.getInstance();
    const results = db.searchEntries(filters, page, pageSize);

    const response: ApiResponse<SearchResult> = {
      success: true,
      data: results,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries search API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to search entries',
    };

    return NextResponse.json(response, { status: 500 });
  }
}