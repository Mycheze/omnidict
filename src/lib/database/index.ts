import { DatabaseCore } from "./core";
import { EntryRepository } from "./repositories/EntryRepository";
import { SearchRepository } from "./repositories/SearchRepository";
import { CacheRepository } from "./repositories/CacheRepository";
import {
  UserRepository,
  UpsertUserInput,
  QuotaLimits,
} from "./repositories/UserRepository";
import { AnkiQueueRepository } from "./repositories/AnkiQueueRepository";
import {
  DictionaryEntry,
  MediaUsageRow,
  PendingAnkiCardRow,
  PendingCardStatus,
  SearchFilters,
  SearchResult,
  UserRow,
} from "@/lib/types";

/**
 * Main Database Manager with full async support
 */
class DatabaseManager {
  private core: DatabaseCore;
  private entryRepo: EntryRepository | null = null;
  private searchRepo: SearchRepository | null = null;
  private cacheRepo: CacheRepository | null = null;
  private userRepo: UserRepository | null = null;
  private ankiQueueRepo: AnkiQueueRepository | null = null;
  private static instance: DatabaseManager;

  constructor() {
    this.core = DatabaseCore.getInstance();
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
      this.userRepo = new UserRepository(this.core);
      this.ankiQueueRepo = new AnkiQueueRepository(this.core);
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
    targetLanguage?: string,
  ): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryByHeadword(
      headword,
      sourceLanguage,
      targetLanguage,
    );
  }

  public async getEntryById(entryId: number): Promise<DictionaryEntry | null> {
    await this.ensureReady();
    return this.entryRepo!.getEntryById(entryId);
  }

  public async updateEntry(
    entryId: number,
    entry: DictionaryEntry,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.updateEntry(entryId, entry);
  }

  public async replaceEntry(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string,
    newEntry: DictionaryEntry,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.replaceEntry(
      headword,
      sourceLanguage,
      targetLanguage,
      newEntry,
    );
  }

  public async deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.deleteEntry(
      headword,
      sourceLanguage,
      targetLanguage,
    );
  }

  public async entryExists(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.entryRepo!.entryExists(
      headword,
      sourceLanguage,
      targetLanguage,
    );
  }

  public async getEntryCount(
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<number> {
    await this.ensureReady();
    return this.entryRepo!.getEntryCount(sourceLanguage, targetLanguage);
  }

  public async getEntriesForLanguages(
    sourceLanguage: string,
    targetLanguage: string,
    page = 1,
    pageSize = 200,
  ): Promise<{ entries: DictionaryEntry[]; total: number }> {
    await this.ensureReady();
    return this.entryRepo!.getEntriesForLanguages(
      sourceLanguage,
      targetLanguage,
      page,
      pageSize,
    );
  }

  public async getRecentEntries(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10,
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.entryRepo!.getRecentEntries(
      sourceLanguage,
      targetLanguage,
      limit,
    );
  }

  public async getAllLanguages(): Promise<{
    sourceLanguages: string[];
    targetLanguages: string[];
    definitionLanguages: string[];
  }> {
    await this.ensureReady();
    return this.entryRepo!.getAllLanguages();
  }

  // ===== SEARCH OPERATIONS =====

  public async searchEntries(
    filters: SearchFilters,
    page = 1,
    pageSize = 50,
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.searchEntries(filters, page, pageSize);
  }

  public async advancedSearch(
    filters: {
      searchTerm?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      partOfSpeech?: string;
      hasContext?: boolean;
      dateFrom?: string;
      dateTo?: string;
    },
    page = 1,
    pageSize = 50,
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.advancedSearch(filters, page, pageSize);
  }

  public async searchContent(
    searchTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 50,
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.searchContent(
      searchTerm,
      sourceLanguage,
      targetLanguage,
      limit,
    );
  }

  public async getSearchSuggestions(
    partialTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 10,
  ): Promise<string[]> {
    await this.ensureReady();
    return this.searchRepo!.getSearchSuggestions(
      partialTerm,
      sourceLanguage,
      targetLanguage,
      limit,
    );
  }

  public async getEntriesByPartOfSpeech(
    partOfSpeech: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    page = 1,
    pageSize = 50,
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.getEntriesByPartOfSpeech(
      partOfSpeech,
      sourceLanguage,
      targetLanguage,
      page,
      pageSize,
    );
  }

  public async getContextAwareEntries(
    sourceLanguage?: string,
    targetLanguage?: string,
    page = 1,
    pageSize = 50,
  ): Promise<SearchResult> {
    await this.ensureReady();
    return this.searchRepo!.getContextAwareEntries(
      sourceLanguage,
      targetLanguage,
      page,
      pageSize,
    );
  }

  public async getSimilarEntries(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 5,
  ): Promise<DictionaryEntry[]> {
    await this.ensureReady();
    return this.searchRepo!.getSimilarEntries(
      headword,
      sourceLanguage,
      targetLanguage,
      limit,
    );
  }

  public async getSearchStats(
    sourceLanguage?: string,
    targetLanguage?: string,
  ): Promise<{
    totalEntries: number;
    contextAwareEntries: number;
    partOfSpeechBreakdown: Record<string, number>;
    recentEntries: number;
  }> {
    await this.ensureReady();
    return this.searchRepo!.getSearchStats(sourceLanguage, targetLanguage);
  }

  public async getPaginationIndex(
    filters: {
      searchTerm?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
    },
    pageSize = 50,
  ): Promise<
    Array<{ page: number; startHeadword: string; endHeadword: string }>
  > {
    await this.ensureReady();
    return this.searchRepo!.getPaginationIndex(filters, pageSize);
  }

  // ===== CACHE OPERATIONS =====

  public async cacheLemma(
    word: string,
    lemma: string,
    targetLanguage: string,
  ): Promise<void> {
    await this.ensureReady();
    return this.cacheRepo!.cacheLemma(word, lemma, targetLanguage);
  }

  public async getCachedLemma(
    word: string,
    targetLanguage: string,
  ): Promise<string | null> {
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

  // ===== USER OPERATIONS =====

  public async upsertUser(input: UpsertUserInput): Promise<void> {
    await this.ensureReady();
    return this.userRepo!.upsertUser(input);
  }

  public async getUser(refoldUserId: number): Promise<UserRow | null> {
    await this.ensureReady();
    return this.userRepo!.getUser(refoldUserId);
  }

  public async updateEntitlements(
    refoldUserId: number,
    tier: string,
    paid: boolean,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.userRepo!.updateEntitlements(refoldUserId, tier, paid);
  }

  public async getSettings(
    refoldUserId: number,
  ): Promise<{ settingsJson: string; updatedAt: string } | null> {
    await this.ensureReady();
    return this.userRepo!.getSettings(refoldUserId);
  }

  public async putSettings(
    refoldUserId: number,
    settingsJson: string,
  ): Promise<void> {
    await this.ensureReady();
    return this.userRepo!.putSettings(refoldUserId, settingsJson);
  }

  public async getUsage(
    refoldUserId: number,
    period: string,
  ): Promise<MediaUsageRow | null> {
    await this.ensureReady();
    return this.userRepo!.getUsage(refoldUserId, period);
  }

  public async tryConsumeQuota(
    refoldUserId: number,
    period: string,
    images: number,
    tts: number,
    limits: QuotaLimits,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.userRepo!.tryConsumeQuota(
      refoldUserId,
      period,
      images,
      tts,
      limits,
    );
  }

  public async refundQuota(
    refoldUserId: number,
    period: string,
    images: number,
    tts: number,
  ): Promise<void> {
    await this.ensureReady();
    return this.userRepo!.refundQuota(refoldUserId, period, images, tts);
  }

  // ===== ANKI QUEUE OPERATIONS =====

  public async enqueuePendingCard(
    refoldUserId: number,
    dedupKey: string,
    contextJson: string,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.ankiQueueRepo!.enqueue(refoldUserId, dedupKey, contextJson);
  }

  public async enqueuePendingCards(
    refoldUserId: number,
    cards: Array<{ dedupKey: string; contextJson: string }>,
  ): Promise<number> {
    await this.ensureReady();
    return this.ankiQueueRepo!.enqueueMany(refoldUserId, cards);
  }

  public async listPendingCardsByUser(
    refoldUserId: number,
    statuses: PendingCardStatus[],
  ): Promise<PendingAnkiCardRow[]> {
    await this.ensureReady();
    return this.ankiQueueRepo!.listByUser(refoldUserId, statuses);
  }

  public async claimPendingCard(
    id: number,
    sessionId: string,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.ankiQueueRepo!.claim(id, sessionId);
  }

  public async savePendingCardMediaValues(
    id: number,
    json: string,
  ): Promise<void> {
    await this.ensureReady();
    return this.ankiQueueRepo!.saveMediaValues(id, json);
  }

  public async markPendingCardDone(
    id: number,
    ankiNoteId: number | null,
  ): Promise<void> {
    await this.ensureReady();
    return this.ankiQueueRepo!.markDone(id, ankiNoteId);
  }

  public async markPendingCardError(id: number, error: string): Promise<void> {
    await this.ensureReady();
    return this.ankiQueueRepo!.markError(id, error);
  }

  public async releasePendingCard(id: number): Promise<void> {
    await this.ensureReady();
    return this.ankiQueueRepo!.release(id);
  }

  public async deletePendingCard(
    id: number,
    refoldUserId: number,
  ): Promise<boolean> {
    await this.ensureReady();
    return this.ankiQueueRepo!.deletePending(id, refoldUserId);
  }

  // ===== MAINTENANCE OPERATIONS =====

  public async runMaintenance(): Promise<void> {
    try {
      await this.ensureReady();

      await this.core.runMaintenance();
      await this.cacheRepo!.optimizeCache();

    } catch (error) {
      console.error("Error during database maintenance:", error);
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
    stats: Awaited<ReturnType<DatabaseManager["getDatabaseStats"]>>;
    cacheStats: Awaited<ReturnType<DatabaseManager["getCacheStats"]>>;
    languageBreakdown: Awaited<ReturnType<DatabaseManager["getAllLanguages"]>>;
    recentActivity: {
      totalEntries: number;
      contextAwareEntries: number;
      recentEntries: number;
    };
  }> {
    try {
      await this.ensureReady();

      const [stats, cacheStats, languageBreakdown, recentActivity] =
        await Promise.all([
          this.getDatabaseStats(),
          this.getCacheStats(),
          this.getAllLanguages(),
          this.searchRepo!.getSearchStats(),
        ]);

      return {
        stats,
        cacheStats,
        languageBreakdown,
        recentActivity,
      };
    } catch (error) {
      console.error("Error generating database health report:", error);
      throw error;
    }
  }

  public async vacuumDatabase(): Promise<void> {
    try {
      await this.ensureReady();
      const db = this.core.getDatabase();
      await db.exec("VACUUM");
    } catch (error) {
      console.error("Error vacuuming database:", error);
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
      const tableInfo = (await stmt.all()) as Array<{ name: string }>;
      const hasOrderIndex = tableInfo.some((col) => col.name === "order_index");

      return !hasOrderIndex;
    } catch (error) {
      console.error("Error checking migration status:", error);
      return false;
    }
  }

  public async runMigrations(): Promise<void> {
    await this.ensureReady();
  }

  public async initializeSampleData(): Promise<void> {
    try {
      await this.ensureReady();
      const existingCount = await this.getEntryCount("English", "Czech");

      if (existingCount > 0) {
        return;
      }

      const sampleEntries: DictionaryEntry[] = [
        {
          metadata: {
            source_language: "English",
            target_language: "Czech",
            definition_language: "English",
          },
          headword: "hello",
          part_of_speech: "interjection",
          meanings: [
            {
              definition:
                "A greeting used when meeting someone or answering the phone",
              grammar: {},
              examples: [
                {
                  sentence: "Ahoj, jak se máš?",
                  translation: "Hello, how are you?",
                },
              ],
            },
          ],
        },
      ];

      for (const entry of sampleEntries) {
        await this.addEntry(entry);
      }

    } catch (error) {
      console.error("Error initializing sample data:", error);
    }
  }
}

export default DatabaseManager;
