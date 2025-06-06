import DatabaseManager from '@/lib/database';
import AIManager from '@/lib/ai';
import { DictionaryEntry, SearchFilters, SearchResult, LemmaRequest, LemmaResponse } from '@/lib/types';

/**
 * Dictionary Service Layer
 * Handles business logic and coordinates between database and AI services
 */
export class DictionaryService {
  private db: DatabaseManager;
  private ai: AIManager;
  private static instance: DictionaryService;

  constructor() {
    this.db = DatabaseManager.getInstance();
    this.ai = AIManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DictionaryService {
    if (!DictionaryService.instance) {
      DictionaryService.instance = new DictionaryService();
    }
    return DictionaryService.instance;
  }

  // ===== ENTRY OPERATIONS =====

  /**
   * Create a new dictionary entry
   */
  public async createEntry(
    word: string,
    sourceLanguage: string,
    targetLanguage: string,
    contextSentence?: string
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      console.log('Creating entry for:', word, `(${sourceLanguage} → ${targetLanguage})`);

      // First, get the lemma form of the word
      let lemma: string;
      if (contextSentence && contextSentence.trim()) {
        const { lemma: contextualLemma } = await this.ai.getLemmaWithContext({
          word,
          contextSentence: contextSentence.trim(),
          targetLanguage
        });
        lemma = contextualLemma;
      } else {
        const { lemma: standardLemma } = await this.ai.getLemma({ 
          word, 
          targetLanguage 
        });
        lemma = standardLemma;
      }

      // Check if entry already exists (check both original word and lemma)
      let existingEntry = await this.db.getEntryByHeadword(word, sourceLanguage, targetLanguage);
      if (!existingEntry && lemma !== word) {
        existingEntry = await this.db.getEntryByHeadword(lemma, sourceLanguage, targetLanguage);
      }

      if (existingEntry) {
        console.log('Entry already exists for:', lemma);
        return {
          success: true,
          entry: existingEntry,
        };
      }

      // Generate entry using AI
      let entry: DictionaryEntry | null;
      if (contextSentence && contextSentence.trim()) {
        entry = await this.ai.generateContextualEntry({
          word,
          sourceLanguage,
          targetLanguage,
          contextSentence: contextSentence.trim(),
        });
      } else {
        entry = await this.ai.generateEntry({
          word: lemma,
          sourceLanguage,
          targetLanguage,
        });
      }

      if (!entry) {
        return {
          success: false,
          error: 'Failed to generate entry using AI',
        };
      }

      // Save to database
      const entryId = await this.db.addEntry(entry);
      if (!entryId) {
        return {
          success: false,
          error: 'Failed to save entry to database',
        };
      }

      console.log('Entry created successfully:', entry.headword, 
                  entry.metadata.has_context ? '(context-aware)' : '(standard)');

      return {
        success: true,
        entry,
      };
    } catch (error) {
      console.error('Error in createEntry:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get an existing entry
   */
  public async getEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      const entry = await this.db.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
      
      if (!entry) {
        return {
          success: false,
          error: 'Entry not found',
        };
      }

      return {
        success: true,
        entry,
      };
    } catch (error) {
      console.error('Error in getEntry:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Regenerate an existing entry with variation
   */
  public async regenerateEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      console.log('Regenerating entry for:', headword, `(${sourceLanguage} → ${targetLanguage})`);

      // Check if entry exists
      const existingEntry = await this.db.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
      if (!existingEntry) {
        return {
          success: false,
          error: 'Entry not found',
        };
      }

      // Delete the existing entry
      const deleted = await this.db.deleteEntry(headword, sourceLanguage, targetLanguage);
      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete existing entry',
        };
      }

      // Generate new entry with variation
      const newEntry = await this.ai.regenerateEntry({
        word: headword,
        sourceLanguage,
        targetLanguage,
      });

      if (!newEntry) {
        return {
          success: false,
          error: 'Failed to regenerate entry using AI',
        };
      }

      // Save the new entry
      const entryId = await this.db.addEntry(newEntry);
      if (!entryId) {
        return {
          success: false,
          error: 'Failed to save regenerated entry',
        };
      }

      console.log('Entry regenerated successfully:', newEntry.headword);

      return {
        success: true,
        entry: newEntry,
      };
    } catch (error) {
      console.error('Error in regenerateEntry:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete an entry
   */
  public async deleteEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.db.deleteEntry(headword, sourceLanguage, targetLanguage);
      
      if (!deleted) {
        return {
          success: false,
          error: 'Entry not found or failed to delete',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error in deleteEntry:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== SEARCH OPERATIONS =====

  /**
   * Search entries with filters
   */
  public async searchEntries(
    filters: SearchFilters,
    page = 1,
    pageSize = 50
  ): Promise<{ success: boolean; result?: SearchResult; error?: string }> {
    try {
      const result = await this.db.searchEntries(filters, page, pageSize);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('Error in searchEntries:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get entries for a specific language pair with pagination
   */
  public async getEntriesForLanguages(
    sourceLanguage: string,
    targetLanguage: string,
    page = 1,
    pageSize = 200
  ): Promise<{ success: boolean; result?: { entries: DictionaryEntry[]; total: number }; error?: string }> {
    try {
      const result = await this.db.getEntriesForLanguages(sourceLanguage, targetLanguage, page, pageSize);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('Error in getEntriesForLanguages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get search suggestions
   */
  public async getSearchSuggestions(
    partialTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 10
  ): Promise<{ success: boolean; suggestions?: string[]; error?: string }> {
    try {
      const suggestions = await this.db.getSearchSuggestions(
        partialTerm, 
        sourceLanguage, 
        targetLanguage, 
        limit
      );
      
      return {
        success: true,
        suggestions,
      };
    } catch (error) {
      console.error('Error in getSearchSuggestions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get similar entries
   */
  public async getSimilarEntries(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 5
  ): Promise<{ success: boolean; entries?: DictionaryEntry[]; error?: string }> {
    try {
      const entries = await this.db.getSimilarEntries(
        headword, 
        sourceLanguage, 
        targetLanguage, 
        limit
      );
      
      return {
        success: true,
        entries,
      };
    } catch (error) {
      console.error('Error in getSimilarEntries:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== LEMMA OPERATIONS =====

  /**
   * Get lemma for a word
   */
  public async getLemma(request: LemmaRequest): Promise<{ success: boolean; result?: LemmaResponse; error?: string }> {
    try {
      const result = await this.ai.getLemma(request);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('Error in getLemma:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get contextual lemma
   */
  public async getContextualLemma(
    word: string,
    contextSentence: string,
    targetLanguage: string
  ): Promise<{ success: boolean; result?: LemmaResponse; error?: string }> {
    try {
      const result = await this.ai.getLemmaWithContext({
        word,
        contextSentence,
        targetLanguage,
      });
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('Error in getContextualLemma:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== LANGUAGE OPERATIONS =====

  /**
   * Get all available languages
   */
  public async getAllLanguages(): Promise<{ 
    success: boolean; 
    languages?: { 
      sourceLanguages: string[]; 
      targetLanguages: string[]; 
      definitionLanguages: string[] 
    }; 
    error?: string 
  }> {
    try {
      const languages = await this.db.getAllLanguages();
      
      return {
        success: true,
        languages,
      };
    } catch (error) {
      console.error('Error in getAllLanguages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate a language name using AI
   */
  public async validateLanguage(
    languageName: string
  ): Promise<{ success: boolean; result?: { standardizedName: string; displayName: string }; error?: string }> {
    try {
      const result = await this.ai.validateLanguage(languageName);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error('Error in validateLanguage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== ANALYTICS OPERATIONS =====

  /**
   * Get comprehensive dictionary statistics
   */
  public async getDictionaryStats(
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<{ 
    success: boolean; 
    stats?: {
      overview: ReturnType<DatabaseManager['getDatabaseStats']>;
      searchStats: Awaited<ReturnType<DatabaseManager['getSearchStats']>>;
      cacheStats: Awaited<ReturnType<DatabaseManager['getCacheStats']>>;
      languages: Awaited<ReturnType<DatabaseManager['getAllLanguages']>>;
    }; 
    error?: string 
  }> {
    try {
      const [searchStats, cacheStats, languages] = await Promise.all([
        this.db.getSearchStats(sourceLanguage, targetLanguage),
        this.db.getCacheStats(),
        this.db.getAllLanguages(),
      ]);
      const overview = this.db.getDatabaseStats();

      return {
        success: true,
        stats: {
          overview,
          searchStats,
          cacheStats,
          languages,
        },
      };
    } catch (error) {
      console.error('Error in getDictionaryStats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recent activity for a language pair
   */
  public async getRecentActivity(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10
  ): Promise<{ success: boolean; entries?: DictionaryEntry[]; error?: string }> {
    try {
      const entries = await this.db.getRecentEntries(sourceLanguage, targetLanguage, limit);
      
      return {
        success: true,
        entries,
      };
    } catch (error) {
      console.error('Error in getRecentActivity:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== MAINTENANCE OPERATIONS =====

  /**
   * Perform database maintenance
   */
  public async performMaintenance(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.runMaintenance();
      
      // Also clear expired cache entries
      await this.db.clearExpiredLemmaCache();
      
      return {
        success: true,
      };
    } catch (error) {
      console.error('Error in performMaintenance:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run database health check
   */
  public async runHealthCheck(): Promise<{ 
    success: boolean; 
    report?: Awaited<ReturnType<DatabaseManager['getDatabaseHealthReport']>>; 
    error?: string 
  }> {
    try {
      const report = await this.db.getDatabaseHealthReport();
      
      return {
        success: true,
        report,
      };
    } catch (error) {
      console.error('Error in runHealthCheck:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Initialize database with migrations and sample data
   */
  public async initializeDatabase(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check and run migrations
      const needsMigration = await this.db.checkMigrationNeeded();
      if (needsMigration) {
        await this.db.runMigrations();
      }

      // Initialize sample data if database is empty (development only)
      if (process.env.NODE_ENV === 'development') {
        await this.db.initializeSampleData();
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error in initializeDatabase:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===== BULK OPERATIONS =====

  /**
   * Bulk create entries from a list
   */
  public async bulkCreateEntries(
    words: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ 
    success: boolean; 
    results?: Array<{ word: string; success: boolean; entry?: DictionaryEntry; error?: string }>; 
    error?: string 
  }> {
    try {
      const results = [];
      
      for (const word of words) {
        const result = await this.createEntry(word, sourceLanguage, targetLanguage);
        results.push({
          word,
          ...result,
        });
        
        // Small delay to avoid overwhelming the AI API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error('Error in bulkCreateEntries:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Export entries to JSON
   */
  public async exportEntries(
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<{ success: boolean; data?: DictionaryEntry[]; error?: string }> {
    try {
      const result = await this.db.getEntriesForLanguages(
        sourceLanguage || '',
        targetLanguage || '',
        1,
        10000 // Large page size to get all entries
      );

      return {
        success: true,
        data: result.entries,
      };
    } catch (error) {
      console.error('Error in exportEntries:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Import entries from JSON
   */
  public async importEntries(
    entries: DictionaryEntry[]
  ): Promise<{ 
    success: boolean; 
    results?: Array<{ headword: string; success: boolean; error?: string }>; 
    error?: string 
  }> {
    try {
      const results = [];
      
      for (const entry of entries) {
        try {
          const entryId = await this.db.addEntry(entry);
          results.push({
            headword: entry.headword,
            success: !!entryId,
            error: entryId ? undefined : 'Failed to save entry',
          });
        } catch (error) {
          results.push({
            headword: entry.headword,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error('Error in importEntries:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}