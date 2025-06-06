import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, DEFAULT_SECURITY } from '@/lib/security/middleware';
import DatabaseManager from '@/lib/database';
import AIManager from '@/lib/ai';
import { ApiResponse, DictionaryEntry } from '@/lib/types';

interface SimplifiedRegenerateRequest {
  headword: string;
  sourceLanguage: string;
  targetLanguage: string;
}

async function regenerateEntryHandler(request: NextRequest) {
  try {
    const { headword, sourceLanguage, targetLanguage }: SimplifiedRegenerateRequest = await request.json();

    if (!headword || !sourceLanguage || !targetLanguage) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required parameters: headword, sourceLanguage, targetLanguage',
      };
      return NextResponse.json(response, { status: 400 });
    }

    console.log('Regenerating entry for:', headword, `(${sourceLanguage} → ${targetLanguage})`);

    const db = DatabaseManager.getInstance();
    const ai = AIManager.getInstance();

    // Check if entry exists
    const existingEntry = await db.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
    if (!existingEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Entry not found',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Delete the existing entry
    const deleted = await db.deleteEntry(headword, sourceLanguage, targetLanguage);
    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to delete existing entry',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Generate new entry with variation
    const newEntry = await ai.regenerateEntry({
      word: headword,
      sourceLanguage,
      targetLanguage,
    });

    if (!newEntry) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to regenerate entry',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Save the new entry
    const entryId = await db.addEntry(newEntry);
    if (!entryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to save regenerated entry',
      };
      return NextResponse.json(response, { status: 500 });
    }

    console.log('Entry regenerated successfully:', newEntry.headword);

    const response: ApiResponse<DictionaryEntry> = {
      success: true,
      data: newEntry,
      message: 'Entry regenerated successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries regenerate API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate entry',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(regenerateEntryHandler, DEFAULT_SECURITY);