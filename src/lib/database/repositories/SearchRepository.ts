import { DatabaseCore } from '../core';
import { SearchFilters, SearchResult, DictionaryEntry } from '@/lib/types';
import { EntryRepository } from './EntryRepository';

// Type alias for SQL parameters to fix TypeScript errors
type SqlParam = string | number | null;

/**
 * Repository for search operations
 * Handles entry searching with optimization and caching
 */
export class SearchRepository {
  private core: DatabaseCore;
  private entryRepo: EntryRepository;
  private statements: ReturnType<DatabaseCore['prepareStatements']> | null = null;

  constructor(core: DatabaseCore) {
    this.core = core;
    this.entryRepo = new EntryRepository(core);
    // Don't prepare statements immediately
  }

  /**
   * Get prepared statements, initializing them if needed
   */
  private getStatements() {
    if (!this.statements) {
      this.statements = this.core.prepareStatements();
    }
    return this.statements;
  }

  /**
   * Search entries with optimized prefix matching and relevance scoring
   */
  public async searchEntries(filters: SearchFilters, page = 1, pageSize = 50): Promise<SearchResult> {
    try {
      const db = this.core.getDatabase();
      
      let baseQuery = 'FROM entries WHERE 1=1';
      const params: SqlParam[] = [];

      // Language filters (use composite index)
      if (filters.sourceLanguage && filters.sourceLanguage !== 'All') {
        baseQuery += ' AND source_language = ?';
        params.push(filters.sourceLanguage);
      }
      if (filters.targetLanguage && filters.targetLanguage !== 'All') {
        baseQuery += ' AND target_language = ?';
        params.push(filters.targetLanguage);
      }

      // Optimized search term handling
      if (filters.searchTerm && filters.searchTerm.trim()) {
        const term = filters.searchTerm.trim();
        
        if (term.length <= 3) {
          // For short terms, use prefix matching (leverages index)
          baseQuery += ' AND headword LIKE ? COLLATE NOCASE';
          params.push(`${term}%`);
        } else {
          // For longer terms, use contains with case-insensitive matching
          baseQuery += ' AND (headword LIKE ? COLLATE NOCASE OR headword LIKE ? COLLATE NOCASE)';
          params.push(`${term}%`, `%${term}%`);
        }
      }

      // Part of speech filter
      if (filters.partOfSpeech && filters.partOfSpeech !== 'All') {
        baseQuery += ' AND (part_of_speech = ? OR part_of_speech LIKE ?)';
        params.push(filters.partOfSpeech, `%"${filters.partOfSpeech}"%`);
      }

      // Get total count efficiently
      const countQuery = `SELECT COUNT(*) as count ${baseQuery}`;
      const countResult = db.prepare(countQuery).get(...params) as { count: number };
      const total = countResult.count;

      // Build entries efficiently using optimized query
      let entries: DictionaryEntry[] = [];
      
      if (filters.searchTerm && filters.searchTerm.trim()) {
        // Use optimized search with ranking for search terms
        entries = await this.searchEntriesWithRanking(
          filters.searchTerm.trim(),
          filters.sourceLanguage || '',
          filters.targetLanguage || '',
          pageSize,
          (page - 1) * pageSize
        );
      } else {
        // Use regular query for browsing without search term
        let orderBy = 'ORDER BY headword COLLATE NOCASE';
        
        // Main query for browsing
        const mainQuery = `
          SELECT id ${baseQuery} 
          ${orderBy}
          LIMIT ? OFFSET ?
        `;
        params.push(pageSize, (page - 1) * pageSize);

        const rows = db.prepare(mainQuery).all(...params) as { id: number }[];
        
        // Construct entries efficiently
        for (const row of rows) {
          const entry = await this.entryRepo.getEntryById(row.id);
          if (entry) entries.push(entry);
        }
      }

      return {
        entries,
        total,
        page,
        pageSize
      };
    } catch (error) {
      console.error('Error searching entries:', error);
      return { entries: [], total: 0, page, pageSize };
    }
  }

  /**
   * Search entries with relevance ranking
   */
  private async searchEntriesWithRanking(
    searchTerm: string,
    sourceLanguage: string,
    targetLanguage: string,
    limit: number,
    offset: number
  ): Promise<DictionaryEntry[]> {
    try {
      const db = this.core.getDatabase();
      
      // Use prepared statement for optimal performance
      const statements = this.getStatements();
      const rows = statements.searchEntries.all(
        searchTerm,           // For exact match ranking
        searchTerm,           // For prefix match ranking
        sourceLanguage,       // Source language filter
        targetLanguage,       // Target language filter
        searchTerm,           // For prefix search
        searchTerm,           // For contains search
        limit,                // LIMIT
        offset                // OFFSET
      ) as Array<{ id: number; headword: string; rank_score: number }>;

      // Get full entry data for each result
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.entryRepo.getEntryById(row.id);
        if (entry) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
      console.error('Error in ranked search:', error);
      return [];
    }
  }

  /**
   * Get entries for specific language pair with pagination
   */
  public async getEntriesForLanguages(
    sourceLanguage: string,
    targetLanguage: string,
    page = 1,
    pageSize = 200
  ): Promise<SearchResult> {
    return this.searchEntries(
      { sourceLanguage, targetLanguage },
      page,
      pageSize
    );
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
    try {
      const db = this.core.getDatabase();
      
      let whereClause = 'WHERE 1=1';
      const params: SqlParam[] = [];

      // Basic filters
      if (filters.sourceLanguage) {
        whereClause += ' AND source_language = ?';
        params.push(filters.sourceLanguage);
      }
      
      if (filters.targetLanguage) {
        whereClause += ' AND target_language = ?';
        params.push(filters.targetLanguage);
      }

      // Search term with fuzzy matching
      if (filters.searchTerm) {
        const term = filters.searchTerm.trim();
        whereClause += ' AND (headword LIKE ? COLLATE NOCASE OR headword LIKE ? COLLATE NOCASE)';
        params.push(`${term}%`, `%${term}%`);
      }

      // Part of speech filter
      if (filters.partOfSpeech) {
        whereClause += ' AND (part_of_speech = ? OR part_of_speech LIKE ?)';
        params.push(filters.partOfSpeech, `%"${filters.partOfSpeech}"%`);
      }

      // Context filter
      if (filters.hasContext !== undefined) {
        whereClause += ' AND has_context = ?';
        params.push(filters.hasContext ? 1 : 0);
      }

      // Date range filters
      if (filters.dateFrom) {
        whereClause += ' AND created_at >= ?';
        params.push(filters.dateFrom);
      }
      
      if (filters.dateTo) {
        whereClause += ' AND created_at <= ?';
        params.push(filters.dateTo);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM entries ${whereClause}`;
      const countResult = db.prepare(countQuery).get(...params) as { count: number };

      // Get entries with ranking
      let orderBy = 'ORDER BY ';
      if (filters.searchTerm) {
        orderBy += `
          CASE 
            WHEN headword = ? COLLATE NOCASE THEN 1
            WHEN headword LIKE ? COLLATE NOCASE THEN 2
            ELSE 3
          END,
          created_at DESC
        `;
        params.push(filters.searchTerm, `${filters.searchTerm}%`);
      } else {
        orderBy += 'created_at DESC';
      }

      const mainQuery = `
        SELECT id FROM entries ${whereClause} 
        ${orderBy}
        LIMIT ? OFFSET ?
      `;
      params.push(pageSize, (page - 1) * pageSize);

      const rows = db.prepare(mainQuery).all(...params) as { id: number }[];
      
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.entryRepo.getEntryById(row.id);
        if (entry) entries.push(entry);
      }

      return {
        entries,
        total: countResult.count,
        page,
        pageSize
      };
    } catch (error) {
      console.error('Error in advanced search:', error);
      return { entries: [], total: 0, page, pageSize };
    }
  }

  /**
   * Search within definitions and examples (content search)
   */
  public async searchContent(
    searchTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 50
  ): Promise<DictionaryEntry[]> {
    try {
      const db = this.core.getDatabase();
      
      let query = `
        SELECT DISTINCT e.id 
        FROM entries e
        LEFT JOIN meanings m ON e.id = m.entry_id
        LEFT JOIN examples ex ON m.id = ex.meaning_id
        WHERE (
          m.definition LIKE ? COLLATE NOCASE OR 
          ex.sentence LIKE ? COLLATE NOCASE OR 
          ex.translation LIKE ? COLLATE NOCASE
        )
      `;
      
      const params: SqlParam[] = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];

      if (sourceLanguage) {
        query += ' AND e.source_language = ?';
        params.push(sourceLanguage);
      }
      
      if (targetLanguage) {
        query += ' AND e.target_language = ?';
        params.push(targetLanguage);
      }

      query += ' ORDER BY e.created_at DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(query).all(...params) as Array<{ id: number }>;
      
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.entryRepo.getEntryById(row.id);
        if (entry) entries.push(entry);
      }
      
      return entries;
    } catch (error) {
      console.error('Error in content search:', error);
      return [];
    }
  }

  /**
   * Get search suggestions based on partial input
   */
  public async getSearchSuggestions(
    partialTerm: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 10
  ): Promise<string[]> {
    try {
      const db = this.core.getDatabase();
      
      let query = `
        SELECT DISTINCT headword 
        FROM entries 
        WHERE headword LIKE ? COLLATE NOCASE
      `;
      
      const params: SqlParam[] = [`${partialTerm}%`];

      if (sourceLanguage) {
        query += ' AND source_language = ?';
        params.push(sourceLanguage);
      }
      
      if (targetLanguage) {
        query += ' AND target_language = ?';
        params.push(targetLanguage);
      }

      query += ' ORDER BY headword COLLATE NOCASE LIMIT ?';
      params.push(limit);

      const rows = db.prepare(query).all(...params) as Array<{ headword: string }>;
      
      return rows.map(row => row.headword);
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
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
    return this.searchEntries({
      partOfSpeech,
      sourceLanguage,
      targetLanguage,
    }, page, pageSize);
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
    try {
      const db = this.core.getDatabase();
      
      let whereClause = 'WHERE has_context = 1';
      const params: SqlParam[] = [];

      if (sourceLanguage) {
        whereClause += ' AND source_language = ?';
        params.push(sourceLanguage);
      }
      
      if (targetLanguage) {
        whereClause += ' AND target_language = ?';
        params.push(targetLanguage);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM entries ${whereClause}`;
      const countResult = db.prepare(countQuery).get(...params) as { count: number };

      // Get entries
      const mainQuery = `
        SELECT id FROM entries ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      params.push(pageSize, (page - 1) * pageSize);

      const rows = db.prepare(mainQuery).all(...params) as { id: number }[];
      
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.entryRepo.getEntryById(row.id);
        if (entry) entries.push(entry);
      }

      return {
        entries,
        total: countResult.count,
        page,
        pageSize
      };
    } catch (error) {
      console.error('Error getting context-aware entries:', error);
      return { entries: [], total: 0, page, pageSize };
    }
  }

  /**
   * Get similar entries based on headword similarity
   */
  public async getSimilarEntries(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    limit = 5
  ): Promise<DictionaryEntry[]> {
    try {
      const db = this.core.getDatabase();
      
      // Use simple Levenshtein-like matching with LIKE patterns
      let query = `
        SELECT id FROM entries 
        WHERE headword != ? 
        AND (
          headword LIKE ? COLLATE NOCASE OR
          headword LIKE ? COLLATE NOCASE OR
          headword LIKE ? COLLATE NOCASE
        )
      `;
      
      const params: SqlParam[] = [
        headword,
        `${headword.substring(0, 3)}%`,  // Same prefix
        `%${headword.substring(1)}`,     // Same suffix
        `%${headword.substring(1, -1)}%` // Contains middle part
      ];

      if (sourceLanguage) {
        query += ' AND source_language = ?';
        params.push(sourceLanguage);
      }
      
      if (targetLanguage) {
        query += ' AND target_language = ?';
        params.push(targetLanguage);
      }

      query += ' ORDER BY headword COLLATE NOCASE LIMIT ?';
      params.push(limit);

      const rows = db.prepare(query).all(...params) as Array<{ id: number }>;
      
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.entryRepo.getEntryById(row.id);
        if (entry) entries.push(entry);
      }
      
      return entries;
    } catch (error) {
      console.error('Error getting similar entries:', error);
      return [];
    }
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
    try {
      const db = this.core.getDatabase();
      
      let whereClause = '1=1';
      const params: SqlParam[] = [];

      if (sourceLanguage) {
        whereClause += ' AND source_language = ?';
        params.push(sourceLanguage);
      }
      
      if (targetLanguage) {
        whereClause += ' AND target_language = ?';
        params.push(targetLanguage);
      }

      // Total entries
      const totalResult = db.prepare(
        `SELECT COUNT(*) as count FROM entries WHERE ${whereClause}`
      ).get(...params) as { count: number };

      // Context-aware entries
      const contextResult = db.prepare(
        `SELECT COUNT(*) as count FROM entries WHERE ${whereClause} AND has_context = 1`
      ).get(...params) as { count: number };

      // Recent entries (last 7 days)
      const recentResult = db.prepare(
        `SELECT COUNT(*) as count FROM entries WHERE ${whereClause} AND created_at > datetime('now', '-7 days')`
      ).get(...params) as { count: number };

      // Part of speech breakdown
      const posResults = db.prepare(
        `SELECT part_of_speech, COUNT(*) as count FROM entries WHERE ${whereClause} GROUP BY part_of_speech`
      ).all(...params) as Array<{ part_of_speech: string; count: number }>;

      const partOfSpeechBreakdown: Record<string, number> = {};
      posResults.forEach(result => {
        try {
          // Handle both string and JSON array formats
          const pos = result.part_of_speech;
          if (pos.startsWith('[')) {
            const posArray = JSON.parse(pos) as string[];
            posArray.forEach(p => {
              partOfSpeechBreakdown[p] = (partOfSpeechBreakdown[p] || 0) + result.count;
            });
          } else {
            partOfSpeechBreakdown[pos] = (partOfSpeechBreakdown[pos] || 0) + result.count;
          }
        } catch {
          partOfSpeechBreakdown[result.part_of_speech] = result.count;
        }
      });

      return {
        totalEntries: totalResult.count,
        contextAwareEntries: contextResult.count,
        partOfSpeechBreakdown,
        recentEntries: recentResult.count,
      };
    } catch (error) {
      console.error('Error getting search stats:', error);
      return {
        totalEntries: 0,
        contextAwareEntries: 0,
        partOfSpeechBreakdown: {},
        recentEntries: 0,
      };
    }
  }
}