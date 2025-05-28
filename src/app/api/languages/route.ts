import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import { ApiResponse } from '@/lib/types';

export async function GET() {
  try {
    const db = DatabaseManager.getInstance();
    const languages = db.getAllLanguages();

    const response: ApiResponse<typeof languages> = {
      success: true,
      data: languages,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in languages API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to get languages',
    };

    return NextResponse.json(response, { status: 500 });
  }
}