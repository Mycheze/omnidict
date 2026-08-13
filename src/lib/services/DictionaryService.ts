import DatabaseManager from "@/lib/database";
import AIManager, { AIManagerConfig } from "@/lib/ai";
import { isValidProviderType } from "@/lib/ai/providers/metadata";
import { DictionaryEntry, SearchFilters, SearchResult } from "@/lib/types";

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
    // AI manager will be configured later based on user settings
    this.ai = AIManager.getInstance();
  }

  /**
   * Get an AIManager instance for the given provider config.
   * Creates a new instance per call to avoid race conditions on the singleton.
   * Falls back to the default singleton when no config is provided.
   */
  private getAIForConfig(providerConfig?: {
    providerType?: string;
    apiKey?: string;
    model?: string;
  }): AIManager {
    if (providerConfig?.providerType) {
      if (!isValidProviderType(providerConfig.providerType)) {
        throw new Error(
          `Invalid AI provider type: ${providerConfig.providerType}`,
        );
      }
      const config: AIManagerConfig = {
        providerType: providerConfig.providerType,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
      };
      return AIManager.createProviderInstance(config);
    }
    return this.ai;
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
   * Create a new dictionary entry.
   * Accepts optional provider config to avoid mutating the singleton.
   */
  public async createEntry(
    word: string,
    sourceLanguage: string,
    targetLanguage: string,
    contextSentence?: string,
    providerConfig?: { providerType?: string; apiKey?: string; model?: string },
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      const ai = this.getAIForConfig(providerConfig);

      // First, resolve the word to its TARGET-language lemma. The word may be
      // typed in either the base or the target language; the lemma contract
      // always yields a target-language headword.
      let lemma: string;
      if (contextSentence && contextSentence.trim()) {
        const { lemma: contextualLemma } = await ai.getLemmaWithContext({
          word,
          contextSentence: contextSentence.trim(),
          targetLanguage,
          sourceLanguage,
        });
        lemma = contextualLemma;
      } else {
        const { lemma: standardLemma } = await ai.getLemma({
          word,
          targetLanguage,
          sourceLanguage,
        });
        lemma = standardLemma;
      }

      // Check if entry already exists (check both original word and lemma)
      let existingEntry = await this.db.getEntryByHeadword(
        word,
        sourceLanguage,
        targetLanguage,
      );
      if (!existingEntry && lemma !== word) {
        existingEntry = await this.db.getEntryByHeadword(
          lemma,
          sourceLanguage,
          targetLanguage,
        );
      }

      if (existingEntry) {
        return {
          success: true,
          entry: existingEntry,
        };
      }

      // Generate entry using AI
      let entry: DictionaryEntry | null;
      if (contextSentence && contextSentence.trim()) {
        entry = await ai.generateContextualEntry({
          word,
          sourceLanguage,
          targetLanguage,
          contextSentence: contextSentence.trim(),
          // Reuse the lemma resolved above instead of re-deriving it
          lemma,
        });
      } else {
        entry = await ai.generateEntry({
          word: lemma,
          sourceLanguage,
          targetLanguage,
        });
      }

      if (!entry) {
        return {
          success: false,
          error: "Failed to generate entry using AI",
        };
      }

      // Save to database
      const entryId = await this.db.addEntry(entry);
      if (!entryId) {
        return {
          success: false,
          error: "Failed to save entry to database",
        };
      }

      return {
        success: true,
        entry,
      };
    } catch (error) {
      console.error("Error in createEntry:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get an existing entry
   */
  public async getEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      const entry = await this.db.getEntryByHeadword(
        headword,
        sourceLanguage,
        targetLanguage,
      );

      if (!entry) {
        return {
          success: false,
          error: "Entry not found",
        };
      }

      return {
        success: true,
        entry,
      };
    } catch (error) {
      console.error("Error in getEntry:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Regenerate an existing entry with variation.
   * Generates the new entry BEFORE deleting the old one to prevent data loss.
   * Accepts optional provider config to avoid mutating the singleton.
   */
  public async regenerateEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string,
    providerConfig?: { providerType?: string; apiKey?: string; model?: string },
  ): Promise<{ success: boolean; entry?: DictionaryEntry; error?: string }> {
    try {
      // Check if entry exists
      const existingEntry = await this.db.getEntryByHeadword(
        headword,
        sourceLanguage,
        targetLanguage,
      );
      if (!existingEntry) {
        return {
          success: false,
          error: "Entry not found",
        };
      }

      // Generate new entry BEFORE deleting the old one to prevent data loss
      const ai = this.getAIForConfig(providerConfig);
      const newEntry = await ai.regenerateEntry({
        word: headword,
        sourceLanguage,
        targetLanguage,
      });

      if (!newEntry) {
        return {
          success: false,
          error: "Failed to regenerate entry using AI",
        };
      }

      // Atomically replace the old entry with the new one (transactional update)
      const replaced = await this.db.replaceEntry(
        headword,
        sourceLanguage,
        targetLanguage,
        newEntry,
      );
      if (!replaced) {
        return {
          success: false,
          error: "Failed to save regenerated entry",
        };
      }

      return {
        success: true,
        entry: newEntry,
      };
    } catch (error) {
      console.error("Error in regenerateEntry:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Delete an entry
   */
  public async deleteEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.db.deleteEntry(
        headword,
        sourceLanguage,
        targetLanguage,
      );

      if (!deleted) {
        return {
          success: false,
          error: "Entry not found or failed to delete",
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in deleteEntry:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
    pageSize = 50,
  ): Promise<{ success: boolean; result?: SearchResult; error?: string }> {
    try {
      const result = await this.db.searchEntries(filters, page, pageSize);

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error("Error in searchEntries:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
    pageSize = 200,
  ): Promise<{
    success: boolean;
    result?: { entries: DictionaryEntry[]; total: number };
    error?: string;
  }> {
    try {
      const result = await this.db.getEntriesForLanguages(
        sourceLanguage,
        targetLanguage,
        page,
        pageSize,
      );

      return {
        success: true,
        result,
      };
    } catch (error) {
      console.error("Error in getEntriesForLanguages:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
    limit = 10,
  ): Promise<{ success: boolean; suggestions?: string[]; error?: string }> {
    try {
      const suggestions = await this.db.getSearchSuggestions(
        partialTerm,
        sourceLanguage,
        targetLanguage,
        limit,
      );

      return {
        success: true,
        suggestions,
      };
    } catch (error) {
      console.error("Error in getSearchSuggestions:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
    limit = 5,
  ): Promise<{
    success: boolean;
    entries?: DictionaryEntry[];
    error?: string;
  }> {
    try {
      const entries = await this.db.getSimilarEntries(
        headword,
        sourceLanguage,
        targetLanguage,
        limit,
      );

      return {
        success: true,
        entries,
      };
    } catch (error) {
      console.error("Error in getSimilarEntries:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
      definitionLanguages: string[];
    };
    error?: string;
  }> {
    try {
      const languages = await this.db.getAllLanguages();

      return {
        success: true,
        languages,
      };
    } catch (error) {
      console.error("Error in getAllLanguages:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get recent activity for a language pair
   */
  public async getRecentActivity(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10,
  ): Promise<{
    success: boolean;
    entries?: DictionaryEntry[];
    error?: string;
  }> {
    try {
      const entries = await this.db.getRecentEntries(
        sourceLanguage,
        targetLanguage,
        limit,
      );

      return {
        success: true,
        entries,
      };
    } catch (error) {
      console.error("Error in getRecentActivity:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===== MAINTENANCE OPERATIONS =====

  /**
   * Perform database maintenance
   */
  public async performMaintenance(options?: {
    flushLemmaCache?: boolean;
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await this.db.runMaintenance();

      if (options?.flushLemmaCache) {
        // Full flush for model changeovers: cached lemmas from the old model
        // would otherwise be served until they expire
        await this.db.clearLemmaCache();
      } else {
        // Also clear expired cache entries
        await this.db.clearExpiredLemmaCache();
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in performMaintenance:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Run database health check
   */
  public async runHealthCheck(): Promise<{
    success: boolean;
    report?: Awaited<ReturnType<DatabaseManager["getDatabaseHealthReport"]>>;
    error?: string;
  }> {
    try {
      const report = await this.db.getDatabaseHealthReport();

      return {
        success: true,
        report,
      };
    } catch (error) {
      console.error("Error in runHealthCheck:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Initialize database with migrations and sample data
   */
  public async initializeDatabase(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Check and run migrations
      const needsMigration = await this.db.checkMigrationNeeded();
      if (needsMigration) {
        await this.db.runMigrations();
      }

      // Initialize sample data if database is empty (development only)
      if (process.env.NODE_ENV === "development") {
        await this.db.initializeSampleData();
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("Error in initializeDatabase:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
    targetLanguage: string,
  ): Promise<{
    success: boolean;
    results?: Array<{
      word: string;
      success: boolean;
      entry?: DictionaryEntry;
      error?: string;
    }>;
    error?: string;
  }> {
    try {
      const results = [];

      for (const word of words) {
        const result = await this.createEntry(
          word,
          sourceLanguage,
          targetLanguage,
        );
        results.push({
          word,
          ...result,
        });

        // Small delay to avoid overwhelming the AI API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error("Error in bulkCreateEntries:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Export entries to JSON
   */
  public async exportEntries(
    sourceLanguage?: string,
    targetLanguage?: string,
  ): Promise<{ success: boolean; data?: DictionaryEntry[]; error?: string }> {
    try {
      const result = await this.db.getEntriesForLanguages(
        sourceLanguage || "",
        targetLanguage || "",
        1,
        10000, // Large page size to get all entries
      );

      return {
        success: true,
        data: result.entries,
      };
    } catch (error) {
      console.error("Error in exportEntries:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Import entries from JSON
   */
  public async importEntries(entries: DictionaryEntry[]): Promise<{
    success: boolean;
    results?: Array<{ headword: string; success: boolean; error?: string }>;
    error?: string;
  }> {
    try {
      const results = [];

      for (const entry of entries) {
        try {
          const entryId = await this.db.addEntry(entry);
          results.push({
            headword: entry.headword,
            success: !!entryId,
            error: entryId ? undefined : "Failed to save entry",
          });
        } catch (error) {
          results.push({
            headword: entry.headword,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        success: true,
        results,
      };
    } catch (error) {
      console.error("Error in importEntries:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
