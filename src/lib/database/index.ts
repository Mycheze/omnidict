import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import path from 'path';
import { 
  DictionaryEntry, 
  DatabaseEntry, 
  DatabaseMeaning, 
  DatabaseExample,
  SearchFilters,
  SearchResult 
} from '@/lib/types';

// Extended database types to include context fields
interface ExtendedDatabaseEntry extends DatabaseEntry {
  has_context?: number;
  context_sentence?: string;
}

interface ExtendedDatabaseExample extends DatabaseExample {
  is_context_sentence?: number;
}

class DatabaseManager {
  private db: Database.Database | null = null;
  private turso: any = null;
  private isUsingTurso: boolean = false;
  private static instance: DatabaseManager;

  constructor() {
    this.initializeDatabase();
  }

  /**
   * Initialize database - uses Turso in production, SQLite locally
   */
  private initializeDatabase() {
    // Check if we should use Turso (production)
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;

    if (tursoUrl && tursoToken) {
      // Use Turso for production
      console.log('Initializing Turso database...');
      this.turso = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
      this.isUsingTurso = true;
      console.log('Turso database initialized');
    } else {
      // Use local SQLite for development
      console.log('Initializing local SQLite database...');
      const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dictionary.db');
      
      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      const fs = require('fs');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('Created database directory:', dbDir);
      }
      
      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');
      this.isUsingTurso = false;
      console.log('Local SQLite database initialized at:', dbPath);
    }

    this.createTables();
  }

  /**
   * Execute SQL query - works with both Turso and SQLite
   */
  private async executeQuery(sql: string, params: any[] = []): Promise<any> {
    if (this.isUsingTurso) {
      const result = await this.turso.execute({
        sql,
        args: params,
      });
      return result;
    } else {
      // For local SQLite
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const stmt = this.db!.prepare(sql);
        return { rows: stmt.all(...params) };
      } else {
        const stmt = this.db!.prepare(sql);
        const result = stmt.run(...params);
        return { 
          rows: [],
          lastInsertRowid: result.lastInsertRowid,
          changes: result.changes 
        };
      }
    }
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
   * Create database tables
   */
  private async createTables(): Promise<void> {
    const queries = [
      `CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        headword TEXT NOT NULL,
        part_of_speech TEXT,
        source_language TEXT,
        target_language TEXT,
        definition_language TEXT,
        has_context INTEGER DEFAULT 0,
        context_sentence TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(headword, source_language, target_language, definition_language, has_context, context_sentence)
      )`,
      
      `CREATE TABLE IF NOT EXISTS meanings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        definition TEXT,
        noun_type TEXT,
        verb_type TEXT,
        comparison TEXT,
        FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meaning_id INTEGER,
        sentence TEXT,
        translation TEXT,
        is_context_sentence INTEGER DEFAULT 0,
        FOREIGN KEY(meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
      )`,
      
      `CREATE TABLE IF NOT EXISTS lemma_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        lemma TEXT NOT NULL,
        target_language TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(word, target_language)
      )`,
      
      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_headword ON entries(headword)`,
      `CREATE INDEX IF NOT EXISTS idx_source_language ON entries(source_language)`,
      `CREATE INDEX IF NOT EXISTS idx_target_language ON entries(target_language)`,
      `CREATE INDEX IF NOT EXISTS idx_definition_language ON entries(definition_language)`,
      `CREATE INDEX IF NOT EXISTS idx_has_context ON entries(has_context)`,
      `CREATE INDEX IF NOT EXISTS idx_context_sentence ON entries(context_sentence)`,
      `CREATE INDEX IF NOT EXISTS idx_lemma_word ON lemma_cache(word, target_language)`,
      `CREATE INDEX IF NOT EXISTS idx_is_context_sentence ON examples(is_context_sentence)`
    ];

    for (const query of queries) {
      try {
        await this.executeQuery(query);
      } catch (error) {
        console.error('Error creating table:', error);
      }
    }
  }

  /**
   * Add a new dictionary entry with context support
   */
  public async addEntry(entry: DictionaryEntry): Promise<number | null> {
    try {
      // Check if entry already exists
      const existingQuery = `
        SELECT id FROM entries 
        WHERE headword = ? AND source_language = ? AND target_language = ? AND definition_language = ?
        AND has_context = ? AND COALESCE(context_sentence, '') = ?
      `;
      
      const existingResult = await this.executeQuery(existingQuery, [
        entry.headword,
        entry.metadata.source_language,
        entry.metadata.target_language,
        entry.metadata.definition_language,
        entry.metadata.has_context ? 1 : 0,
        entry.metadata.context_sentence || ''
      ]);

      if (existingResult.rows && existingResult.rows.length > 0) {
        return existingResult.rows[0].id;
      }

      // Insert new entry
      const partOfSpeech = Array.isArray(entry.part_of_speech) 
        ? JSON.stringify(entry.part_of_speech) 
        : entry.part_of_speech;

      const insertEntryQuery = `
        INSERT INTO entries (headword, part_of_speech, source_language, target_language, definition_language, has_context, context_sentence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const entryResult = await this.executeQuery(insertEntryQuery, [
        entry.headword,
        partOfSpeech,
        entry.metadata.source_language,
        entry.metadata.target_language,
        entry.metadata.definition_language,
        entry.metadata.has_context ? 1 : 0,
        entry.metadata.context_sentence || null
      ]);

      const entryId = entryResult.lastInsertRowid as number;

      // Insert meanings and examples
      for (const meaning of entry.meanings) {
        const meaningQuery = `
          INSERT INTO meanings (entry_id, definition, noun_type, verb_type, comparison)
          VALUES (?, ?, ?, ?, ?)
        `;

        const meaningResult = await this.executeQuery(meaningQuery, [
          entryId,
          meaning.definition,
          meaning.grammar.noun_type || null,
          meaning.grammar.verb_type || null,
          meaning.grammar.comparison || null
        ]);

        const meaningId = meaningResult.lastInsertRowid as number;

        // Insert examples
        for (const example of meaning.examples) {
          const exampleQuery = `
            INSERT INTO examples (meaning_id, sentence, translation, is_context_sentence)
            VALUES (?, ?, ?, ?)
          `;

          await this.executeQuery(exampleQuery, [
            meaningId,
            example.sentence,
            example.translation || null,
            example.is_context_sentence ? 1 : 0
          ]);
        }
      }

      return entryId;
    } catch (error) {
      console.error('Error adding entry:', error);
      return null;
    }
  }

  /**
   * Get entry by headword and language combination
   */
  public async getEntryByHeadword(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    definitionLanguage?: string
  ): Promise<DictionaryEntry | null> {
    let query = 'SELECT * FROM entries WHERE headword = ?';
    const params: any[] = [headword];

    if (sourceLanguage) {
      query += ' AND source_language = ?';
      params.push(sourceLanguage);
    }
    if (targetLanguage) {
      query += ' AND target_language = ?';
      params.push(targetLanguage);
    }
    if (definitionLanguage) {
      query += ' AND definition_language = ?';
      params.push(definitionLanguage);
    }

    query += ' ORDER BY created_at DESC LIMIT 1';

    try {
      const result = await this.executeQuery(query, params);
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const entry = result.rows[0] as ExtendedDatabaseEntry;
      return await this.constructEntryObject(entry.id);
    } catch (error) {
      console.error('Error getting entry:', error);
      return null;
    }
  }

  /**
   * Search entries with filters
   */
  public async searchEntries(filters: SearchFilters, page = 1, pageSize = 50): Promise<SearchResult> {
    let query = 'SELECT * FROM entries WHERE 1=1';
    const params: any[] = [];

    if (filters.searchTerm) {
      query += ' AND headword LIKE ?';
      params.push(`%${filters.searchTerm}%`);
    }
    if (filters.sourceLanguage && filters.sourceLanguage !== 'All') {
      query += ' AND source_language = ?';
      params.push(filters.sourceLanguage);
    }
    if (filters.targetLanguage && filters.targetLanguage !== 'All') {
      query += ' AND target_language = ?';
      params.push(filters.targetLanguage);
    }
    if (filters.definitionLanguage && filters.definitionLanguage !== 'All') {
      query += ' AND definition_language = ?';
      params.push(filters.definitionLanguage);
    }

    try {
      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
      const countResult = await this.executeQuery(countQuery, params);
      const total = countResult.rows[0].count;

      // Add pagination
      query += ' ORDER BY headword COLLATE NOCASE LIMIT ? OFFSET ?';
      params.push(pageSize, (page - 1) * pageSize);

      const result = await this.executeQuery(query, params);
      const entries = await Promise.all(
        result.rows.map(async (row: ExtendedDatabaseEntry) => 
          await this.constructEntryObject(row.id)
        )
      );

      return {
        entries: entries.filter(Boolean) as DictionaryEntry[],
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
   * Get all unique languages
   */
  public async getAllLanguages(): Promise<{ sourceLanguages: string[], targetLanguages: string[], definitionLanguages: string[] }> {
    try {
      const sourceResult = await this.executeQuery('SELECT DISTINCT source_language FROM entries');
      const targetResult = await this.executeQuery('SELECT DISTINCT target_language FROM entries');
      const definitionResult = await this.executeQuery('SELECT DISTINCT definition_language FROM entries');

      return {
        sourceLanguages: sourceResult.rows.map((row: any) => row.source_language).filter(Boolean),
        targetLanguages: targetResult.rows.map((row: any) => row.target_language).filter(Boolean),
        definitionLanguages: definitionResult.rows.map((row: any) => row.definition_language).filter(Boolean)
      };
    } catch (error) {
      console.error('Error getting languages:', error);
      return { sourceLanguages: [], targetLanguages: [], definitionLanguages: [] };
    }
  }

  /**
   * Delete an entry
   */
  public async deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    definitionLanguage?: string
  ): Promise<boolean> {
    let query = 'DELETE FROM entries WHERE headword = ?';
    const params: any[] = [headword];

    if (sourceLanguage) {
      query += ' AND source_language = ?';
      params.push(sourceLanguage);
    }
    if (targetLanguage) {
      query += ' AND target_language = ?';
      params.push(targetLanguage);
    }
    if (definitionLanguage) {
      query += ' AND definition_language = ?';
      params.push(definitionLanguage);
    }

    try {
      const result = await this.executeQuery(query, params);
      return (result.changes || 0) > 0;
    } catch (error) {
      console.error('Error deleting entry:', error);
      return false;
    }
  }

  /**
   * Cache a lemma
   */
  public async cacheLemma(word: string, lemma: string, targetLanguage: string): Promise<void> {
    try {
      const query = `
        INSERT OR IGNORE INTO lemma_cache (word, lemma, target_language)
        VALUES (?, ?, ?)
      `;
      await this.executeQuery(query, [word, lemma, targetLanguage]);
    } catch (error) {
      console.error('Error caching lemma:', error);
    }
  }

  /**
   * Get cached lemma
   */
  public async getCachedLemma(word: string, targetLanguage: string): Promise<string | null> {
    try {
      const query = `
        SELECT lemma FROM lemma_cache 
        WHERE word = ? AND target_language = ?
      `;
      const result = await this.executeQuery(query, [word, targetLanguage]);

      if (result.rows && result.rows.length > 0) {
        return result.rows[0].lemma;
      }
      return null;
    } catch (error) {
      console.error('Error getting cached lemma:', error);
      return null;
    }
  }

  /**
   * Clear lemma cache
   */
  public async clearLemmaCache(): Promise<void> {
    try {
      await this.executeQuery('DELETE FROM lemma_cache');
    } catch (error) {
      console.error('Error clearing lemma cache:', error);
    }
  }

  /**
   * Construct a complete entry object from database rows
   */
  private async constructEntryObject(entryId: number): Promise<DictionaryEntry | null> {
    try {
      // Get entry details
      const entryResult = await this.executeQuery('SELECT * FROM entries WHERE id = ?', [entryId]);
      if (!entryResult.rows || entryResult.rows.length === 0) return null;

      const entry = entryResult.rows[0] as ExtendedDatabaseEntry;

      // Get meanings
      const meaningsResult = await this.executeQuery('SELECT * FROM meanings WHERE entry_id = ?', [entryId]);
      
      const entryMeanings = await Promise.all(
        meaningsResult.rows.map(async (meaning: DatabaseMeaning) => {
          // Get examples for this meaning
          const examplesResult = await this.executeQuery('SELECT * FROM examples WHERE meaning_id = ?', [meaning.id]);

          return {
            definition: meaning.definition,
            grammar: {
              noun_type: meaning.noun_type || undefined,
              verb_type: meaning.verb_type || undefined,
              comparison: meaning.comparison || undefined,
            },
            examples: examplesResult.rows.map((example: ExtendedDatabaseExample) => ({
              sentence: example.sentence,
              translation: example.translation || undefined,
              is_context_sentence: Boolean(example.is_context_sentence),
            })),
          };
        })
      );

      // Parse part_of_speech
      let partOfSpeech: string | string[];
      if (entry.part_of_speech) {
        try {
          const parsed = JSON.parse(entry.part_of_speech);
          partOfSpeech = parsed;
        } catch {
          partOfSpeech = entry.part_of_speech;
        }
      } else {
        partOfSpeech = 'unknown';
      }

      return {
        metadata: {
          source_language: entry.source_language,
          target_language: entry.target_language,
          definition_language: entry.definition_language,
          has_context: Boolean(entry.has_context),
          context_sentence: entry.context_sentence || undefined,
        },
        headword: entry.headword,
        part_of_speech: partOfSpeech,
        meanings: entryMeanings,
      };
    } catch (error) {
      console.error('Error constructing entry object:', error);
      return null;
    }
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
    }
    // Turso client doesn't need explicit closing
  }
}

export default DatabaseManager;