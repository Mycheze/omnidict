import { DatabaseCore } from './core';
import { EntryRepository } from './repositories/EntryRepository';
import { SearchRepository } from './repositories/SearchRepository';
import { CacheRepository } from './repositories/CacheRepository';
import { 
  DictionaryEntry, 
  SearchFilters,
  SearchResult 
} from '@/lib/types';

/**
 * Main Database Manager
 * Coordinates between different repositories and provides a unified interface
 */
class DatabaseManager {
  private core: DatabaseCore;
  private entryRepo: EntryRepository | null = null;
  private searchRepo: SearchRepository | null = null;
  private cacheRepo: CacheRepository | null = null;
  private static instance: DatabaseManager;

  constructor() {
    this.core = DatabaseCore.getInstance();
    console.log('Database Manager initialized - repositories will be created lazily');
  }

  /**
   * Get singleton instance of DatabaseManager
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Ensure database is initialized and repositories are ready
   */
  private async ensureReady(): Promise<void> {
    await this.core.ensureInitialized();
    
    // Initialize repositories lazily
    if (!this.entryRepo) {
      this.entryRepo = new EntryRepository(this.core);
      this.searchRepo = new SearchRepository(this.core);
      this.cacheRepo = new CacheRepository(this.core);
    }
  }

  // ===== ENTRY OPERATIONS =====

  /**
   * Add a new dictionary entry
   */
  public async addEntry(entry: DictionaryEntry): Promise<number | null> {
    await this.ensureReady();
    return this.entryRepo!.addEntry(entry);
  }

  /**
   * Get entry by headword
   */
  public async getEntryByHeadword(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
  }

  /**
   * Get entry by ID
   */
  public async getEntryById(entryId: number): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryById(entryId);
  }

  /**
   * Update an existing entry
   */
  public async updateEntry(entryId: number, entry: DictionaryEntry): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.updateEntry(entryId, entry);
  }

  /**
   * Delete an entry
   */
  public async deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.deleteEntry(headword, sourceLanguage, targetLanguage);
  }

  /**
   * Check if an entry exists
   */
  public async entryExists(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.entryExists(headword, sourceLanguage, targetLanguage);
  }

  /**
   * Get entry count for a language pair
   */
  public async getEntryCount(sourceLanguage: string, targetLanguage: string): Promise<number> {
    await this.ensureReady();
    return this.entryRepo!.getEntryCount(sourceLanguage, targetLanguage);
  }

  /**
   * Get entries for specific language pair with pagination
   */
  public async getEntriesForLanguages(
    sourceLanguage: string,
    targetLanguage: string,
    page = 1,
    pageSize = 200
  ): Promise<{ entries: DictionaryEntry[]; total: number }> {
    await this.ensureReady();
    return this.entryRepo!.getEntriesForLanguages(sourceLanguage, targetLanguage, page, pageSize);
  }

  /**
   * Get recent entries
   */
  public async getRecentEntries(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.entryRepo!.getRecentEntries(sourceLanguage, targetLanguage, limit);
  }

  /**
   * Get all unique languages
   */
  public async getAllLanguages(): Promise<{ 
    sourceLanguages: string[]; 
    targetLanguages: string[]; 
    definitionLanguages: string[] 
  }> {
    await this.ensureReady();
    return this.entryRepo!.getAllLanguages();
  }

  // ===== SEARCH OPERATIONS =====

  /**
   * Search entries with filters and pagination
   */
  public async searchEntries(filters: SearchFilters, page = 1, pageSize = 50): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.searchEntries(filters, page, pageSize);
  }

  /**
   * Advanced search with multiple criteria
   */
  public async advancedSearch(filters: {
    searchTerm?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    partOfSpeech?: string;
    hasContext?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }, page = 1, pageSize = 50): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.advancedSearch(filters, page, pageSize);
  }

  /**
   * Search within definitions and examples
   */
  public async searchContent(
    searchTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 50
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.searchContent(searchTerm, sourceLanguage, targetLanguage, limit);
  }

  /**
   * Get search suggestions
   */
  public async getSearchSuggestions(
    partialTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 10
  ): Promise<string[]> {
    await this.ensureReady();
    return this.searchRepo!.getSearchSuggestions(partialTerm, sourceLanguage, targetLanguage, limit);
  }

  /**
   * Get entries by part of speech
   */
  public async getEntriesByPartOfSpeech(
    partOfSpeech: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    page = 1,
    pageSize = 50
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.getEntriesByPartOfSpeech(partOfSpeech, sourceLanguage, targetLanguage, page, pageSize);
  }

  /**
   * Get context-aware entries
   */
  public async getContextAwareEntries(
    sourceLanguage?: string,
    targetLanguage?: string,
    page = 1,
    pageSize = 50
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.getContextAwareEntries(sourceLanguage, targetLanguage, page, pageSize);
  }

  /**
   * Get similar entries
   */
  public async getSimilarEntries(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 5
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.getSimilarEntries(headword, sourceLanguage, targetLanguage, limit);
  }

  /**
   * Get search statistics
   */
  public async getSearchStats(sourceLanguage?: string, targetLanguage?: string): Promise<{
    totalEntries: number;
    contextAwareEntries: number;
    partOfSpeechBreakdown: Record<string, number>;
    recentEntries: number;
  }> {
    await this.ensureReady();
    return this.searchRepo!.getSearchStats(sourceLanguage, targetLanguage);
  }

  // ===== CACHE OPERATIONS =====

  /**
   * Cache a lemma
   */
  public async cacheLemma(word: string, lemma: string, targetLanguage: string): Promise<void> {
    await this.ensureReady();
    return this.cacheRepo!.cacheLemma(word, lemma, targetLanguage);
  }

  /**
   * Get cached lemma
   */
  public async getCachedLemma(word: string, targetLanguage: string): Promise<string | null> {
    await this.ensureReady();
    return this.cacheRepo!.getCachedLemma(word, targetLanguage);
  }

  /**
   * Clear expired lemma cache
   */
  public async clearExpiredLemmaCache(): Promise<number> {
    await this.ensureReady();
    return this.cacheRepo!.clearExpiredLemmaCache();
  }

  /**
   * Clear all lemma cache
   */
  public async clearLemmaCache(): Promise<void> {
    await this.ensureReady();
    return this.cacheRepo!.clearLemmaCache();
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    cacheHitRate: number;
  }> {
    await this.ensureReady();
    return this.cacheRepo!.getCacheStats();
  }

  // ===== MAINTENANCE OPERATIONS =====

  /**
   * Run database maintenance
   */
  public async runMaintenance(): Promise<void> {
    try {
      await this.ensureReady();
      
      // Run core maintenance
      this.core.runMaintenance();
      
      // Optimize cache
      await this.cacheRepo!.optimizeCache();
      
      console.log('Database maintenance completed successfully');
    } catch (error) {
      console.error('Error during database maintenance:', error);
    }
  }

  /**
   * Get database statistics
   */
  public async getDatabaseStats(): Promise<{ 
    entryCount: number; 
    meaningCount: number; 
    exampleCount: number; 
    dbSize: string;
    cacheSize: number;
  }> {
    await this.ensureReady();
    return this.core.getDatabaseStats();
  }

  /**
   * Get comprehensive database health report
   */
  public async getDatabaseHealthReport(): Promise<{
    stats: Awaited<ReturnType<DatabaseManager['getDatabaseStats']>>;
    cacheStats: Awaited<ReturnType<DatabaseManager['getCacheStats']>>;
    languageBreakdown: Awaited<ReturnType<DatabaseManager['getAllLanguages']>>;
    recentActivity: {
      totalEntries: number;
      contextAwareEntries: number;
      recentEntries: number;
    };
  }> {
    try {
      await this.ensureReady();
      
      const [stats, cacheStats, languageBreakdown, recentActivity] = await Promise.all([
        this.getDatabaseStats(),
        this.getCacheStats(),
        this.getAllLanguages(),
        this.searchRepo!.getSearchStats()
      ]);

      return {
        stats,
        cacheStats,
        languageBreakdown,
        recentActivity
      };
    } catch (error) {
      console.error('Error generating database health report:', error);
      throw error;
    }
  }

  /**
   * Vacuum database (use sparingly)
   */
  public async vacuumDatabase(): Promise<void> {
    try {
      await this.ensureReady();
      const db = this.core.getDatabase();
      console.log('Vacuuming database...');
      db.exec('VACUUM');
      console.log('Database vacuum completed');
    } catch (error) {
      console.error('Error vacuuming database:', error);
    }
  }

  /**
   * Close database connections
   */
  public close(): void {
    this.core.close();
  }

  // ===== MIGRATION AND SETUP =====

  /**
   * Check if database needs migration
   */
  public async checkMigrationNeeded(): Promise<boolean> {
    try {
      await this.ensureReady();
      const db = this.core.getDatabase();
      
      // Check if new columns exist
      const tableInfo = db.prepare("PRAGMA table_info(entries)").all() as Array<{name: string}>;
      const hasOrderIndex = tableInfo.some(col => col.name === 'order_index');
      
      return !hasOrderIndex;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Run database migrations if needed
   */
  public async runMigrations(): Promise<void> {
    // Migrations are now handled automatically in the core initialization
    await this.ensureReady();
    console.log('Database migrations handled during initialization');
  }

  /**
   * Initialize database with sample data (for development)
   */
  public async initializeSampleData(): Promise<void> {
    try {
      await this.ensureReady();
      const existingCount = await this.getEntryCount('English', 'Czech');
      
      if (existingCount > 0) {
        console.log('Database already has entries, skipping sample data');
        return;
      }

      console.log('Adding sample data to database...');
      
      const sampleEntries: DictionaryEntry[] = [
        {
          metadata: {
            source_language: 'English',
            target_language: 'Czech',
            definition_language: 'English',
          },
          headword: 'hello',
          part_of_speech: 'interjection',
          meanings: [{
            definition: 'A greeting used when meeting someone or answering the phone',
            grammar: {},
            examples: [{
              sentence: 'Ahoj, jak se máš?',
              translation: 'Hello, how are you?',
            }]
          }]
        },
        // Add more sample entries as needed
      ];

      for (const entry of sampleEntries) {
        await this.addEntry(entry);
      }

      console.log(`Added ${sampleEntries.length} sample entries`);
    } catch (error) {
      console.error('Error initializing sample data:', error);
    }
  }
}

export default DatabaseManager;