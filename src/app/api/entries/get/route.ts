import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import { ApiResponse, DictionaryEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const headword = searchParams.get('headword');
    const sourceLanguage = searchParams.get('sourceLanguage') || undefined;
    const targetLanguage = searchParams.get('targetLanguage') || undefined;

    if (!headword) {
      const response: ApiResponse = {
        success: false,
        error: 'Headword parameter is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const db = DatabaseManager.getInstance();
    
    // Try to find entry with exact language match first
    let entry = await db.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
    
    // If not found and we have language filters, try without definition language filter
    if (!entry && sourceLanguage && targetLanguage) {
      entry = await db.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
    }

    if (!entry) {
      const response: ApiResponse = {
        success: false,
        error: 'Entry not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<DictionaryEntry> = {
      success: true,
      data: entry,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries get API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get entry',
    };

    return NextResponse.json(response, { status: 500 });
  }
}