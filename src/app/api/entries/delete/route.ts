import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import { ApiResponse } from '@/lib/types';

export async function DELETE(request: NextRequest) {
  try {
    const { headword, sourceLanguage, targetLanguage } = await request.json();

    if (!headword) {
      const response: ApiResponse = {
        success: false,
        error: 'Headword is required',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const db = DatabaseManager.getInstance();
    const deleted = db.deleteEntry(headword, sourceLanguage, targetLanguage);

    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: 'Entry not found or failed to delete',
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse = {
      success: true,
      message: 'Entry deleted successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries delete API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete entry',
    };

    return NextResponse.json(response, { status: 500 });
  }
}