import { NextRequest, NextResponse } from 'next/server';
import DatabaseManager from '@/lib/database';
import AIManager from '@/lib/ai';
import { ApiResponse, DictionaryEntry } from '@/lib/types';

// Enhanced request interface
interface EntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
  contextSentence?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { word, sourceLanguage, targetLanguage, contextSentence }: EntryGenerationRequest = await request.json();

    if (!word || !sourceLanguage || !targetLanguage) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required parameters: word, sourceLanguage, targetLanguage',
      };
      return NextResponse.json(response, { status: 400 });
    }

    console.log('Creating entry for:', word, `(${sourceLanguage} → ${targetLanguage})`, 
                contextSentence ? 'with context' : 'without context');

    const db = DatabaseManager.getInstance();
    const ai = AIManager.getInstance();

    let entry: DictionaryEntry | null = null;
    let lemma: string;

    if (contextSentence && contextSentence.trim()) {
      // Context-aware processing
      console.log('Using contextual processing for:', word);
      
      // Get contextual lemma
      const { lemma: contextualLemma } = await ai.getLemmaWithContext({
        word,
        contextSentence: contextSentence.trim(),
        targetLanguage
      });
      lemma = contextualLemma;

      // Check if entry already exists (check both original word and lemma)
      let existingEntry = await db.getEntryByHeadword(word, sourceLanguage, targetLanguage);
      if (!existingEntry && lemma !== word) {
        existingEntry = await db.getEntryByHeadword(lemma, sourceLanguage, targetLanguage);
      }

      if (existingEntry) {
        console.log('Entry already exists for:', lemma);
        const response: ApiResponse<DictionaryEntry> = {
          success: true,
          data: existingEntry,
          message: 'Entry already exists',
        };
        return NextResponse.json(response);
      }

      // Generate contextual entry
      entry = await ai.generateContextualEntry({
        word,
        sourceLanguage,
        targetLanguage,
        contextSentence: contextSentence.trim(),
      });
    } else {
      // Standard processing
      console.log('Using standard processing for:', word);
      
      // First, get the lemma form of the word
      const { lemma: standardLemma } = await ai.getLemma({ 
        word, 
        targetLanguage 
      });
      lemma = standardLemma;

      // Check if entry already exists
      let existingEntry = await db.getEntryByHeadword(word, sourceLanguage, targetLanguage);
      if (!existingEntry && lemma !== word) {
        existingEntry = await db.getEntryByHeadword(lemma, sourceLanguage, targetLanguage);
      }

      if (existingEntry) {
        console.log('Entry already exists for:', lemma);
        const response: ApiResponse<DictionaryEntry> = {
          success: true,
          data: existingEntry,
          message: 'Entry already exists',
        };
        return NextResponse.json(response);
      }

      // Generate standard entry
      entry = await ai.generateEntry({
        word: lemma,
        sourceLanguage,
        targetLanguage,
      });
    }

    if (!entry) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to generate entry',
      };
      return NextResponse.json(response, { status: 500 });
    }

    // Save to database
    const entryId = await db.addEntry(entry);
    if (!entryId) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to save entry to database',
      };
      return NextResponse.json(response, { status: 500 });
    }

    console.log('Entry created and saved successfully:', entry.headword, 
                entry.metadata.has_context ? '(context-aware)' : '(standard)');

    const response: ApiResponse<DictionaryEntry> = {
      success: true,
      data: entry,
      message: entry.metadata.has_context ? 
        'Context-aware entry created successfully' : 
        'Entry created successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in entries create API:', error);
    
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create entry',
    };

    return NextResponse.json(response, { status: 500 });
  }
}