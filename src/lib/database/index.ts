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
 * Main Database Manager with full async support
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

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private async ensureReady(): Promise<void> {
    await this.core.ensureInitialized();
    
    if (!this.entryRepo) {
      this.entryRepo = new EntryRepository(this.core);
      this.searchRepo = new SearchRepository(this.core);
      this.cacheRepo = new CacheRepository(this.core);
    }
  }

  // ===== ENTRY OPERATIONS =====

  public async addEntry(entry: DictionaryEntry): Promise<number | null> {
    await this.ensureReady();
    return this.entryRepo!.addEntry(entry);
  }

  public async getEntryByHeadword(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryByHeadword(headword, sourceLanguage, targetLanguage);
  }

  public async getEntryById(entryId: number): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryById(entryId);
  }

  public async updateEntry(entryId: number, entry: DictionaryEntry): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.updateEntry(entryId, entry);
  }

  public async deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.deleteEntry(headword, sourceLanguage, targetLanguage);
  }

  public async entryExists(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.entryExists(headword, sourceLanguage, targetLanguage);
  }

  public async getEntryCount(sourceLanguage: string, targetLanguage: string): Promise<number> {
    await this.ensureReady();
    return this.entryRepo!.getEntryCount(sourceLanguage, targetLanguage);
  }

  public async getEntriesForLanguages(
    sourceLanguage: string,
    targetLanguage: string,
    page = 1,
    pageSize = 200
  ): Promise<{ entries: DictionaryEntry[]; total: number }> {
    await this.ensureReady();
    return this.entryRepo!.getEntriesForLanguages(sourceLanguage, targetLanguage, page, pageSize);
  }

  public async getRecentEntries(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.entryRepo!.getRecentEntries(sourceLanguage, targetLanguage, limit);
  }

  public async getAllLanguages(): Promise<{ 
    sourceLanguages: string[]; 
    targetLanguages: string[]; 
    definitionLanguages: string[] 
  }> {
    await this.ensureReady();
    return this.entryRepo!.getAllLanguages();
  }

  // ===== SEARCH OPERATIONS =====

  public async searchEntries(filters: SearchFilters, page = 1, pageSize = 50): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.searchEntries(filters, page, pageSize);
  }

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

  public async searchContent(
    searchTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 50
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.searchContent(searchTerm, sourceLanguage, targetLanguage, limit);
  }

  public async getSearchSuggestions(
    partialTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 10
  ): Promise<string[]> {
    await this.ensureReady();
    return this.searchRepo!.getSearchSuggestions(partialTerm, sourceLanguage, targetLanguage, limit);
  }

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

  public async getContextAwareEntries(
    sourceLanguage?: string,
    targetLanguage?: string,
    page = 1,
    pageSize = 50
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.getContextAwareEntries(sourceLanguage, targetLanguage, page, pageSize);
  }

  public async getSimilarEntries(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 5
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.getSimilarEntries(headword, sourceLanguage, targetLanguage, limit);
  }

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

  public async cacheLemma(word: string, lemma: string, targetLanguage: string): Promise<void> {
    await this.ensureReady();
    return this.cacheRepo!.cacheLemma(word, lemma, targetLanguage);
  }

  public async getCachedLemma(word: string, targetLanguage: string): Promise<string | null> {
    await this.ensureReady();
    return this.cacheRepo!.getCachedLemma(word, targetLanguage);
  }

  public async clearExpiredLemmaCache(): Promise<number> {
    await this.ensureReady();
    return this.cacheRepo!.clearExpiredLemmaCache();
  }

  public async clearLemmaCache(): Promise<void> {
    await this.ensureReady();
    return this.cacheRepo!.clearLemmaCache();
  }

  public async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    cacheHitRate: number;
  }> {
    await this.ensureReady();
    return this.cacheRepo!.getCacheStats();
  }

  // ===== MAINTENANCE OPERATIONS =====

  public async runMaintenance(): Promise<void> {
    try {
      await this.ensureReady();
      
      await this.core.runMaintenance();
      await this.cacheRepo!.optimizeCache();
      
      console.log('Database maintenance completed successfully');
    } catch (error) {
      console.error('Error during database maintenance:', error);
    }
  }

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

  public async vacuumDatabase(): Promise<void> {
    try {
      await this.ensureReady();
      const db = this.core.getDatabase();
      console.log('Vacuuming database...');
      await db.exec('VACUUM');
      console.log('Database vacuum completed');
    } catch (error) {
      console.error('Error vacuuming database:', error);
    }
  }

  public close(): void {
    this.core.close();
  }

  // ===== MIGRATION AND SETUP =====

  public async checkMigrationNeeded(): Promise<boolean> {
    try {
      await this.ensureReady();
      const db = this.core.getDatabase();
      
      const stmt = db.prepare("PRAGMA table_info(entries)");
      const tableInfo = await stmt.all() as Array<{name: string}>;
      const hasOrderIndex = tableInfo.some(col => col.name === 'order_index');
      
      return !hasOrderIndex;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  public async runMigrations(): Promise<void> {
    await this.ensureReady();
    console.log('Database migrations handled during initialization');
  }

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