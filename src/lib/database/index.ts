import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
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
  private db: Database.Database;
  private static instance: DatabaseManager;

  constructor() {
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
    this.initializeDatabase();
    
    console.log('Database initialized at:', dbPath);
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
   * Initialize database tables and indexes with context support
   */
  private initializeDatabase(): void {
    // Create entries table with context support
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
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
      )
    `);

    // Create meanings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meanings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        definition TEXT,
        noun_type TEXT,
        verb_type TEXT,
        comparison TEXT,
        FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
      )
    `);

    // Create examples table with context marking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meaning_id INTEGER,
        sentence TEXT,
        translation TEXT,
        is_context_sentence INTEGER DEFAULT 0,
        FOREIGN KEY(meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
      )
    `);

    // Create lemma cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lemma_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        lemma TEXT NOT NULL,
        target_language TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(word, target_language)
      )
    `);

    // Migrate existing database to add context columns if they don't exist
    this.migrateDatabase();

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_headword ON entries(headword);
      CREATE INDEX IF NOT EXISTS idx_source_language ON entries(source_language);
      CREATE INDEX IF NOT EXISTS idx_target_language ON entries(target_language);
      CREATE INDEX IF NOT EXISTS idx_definition_language ON entries(definition_language);
      CREATE INDEX IF NOT EXISTS idx_has_context ON entries(has_context);
      CREATE INDEX IF NOT EXISTS idx_context_sentence ON entries(context_sentence);
      CREATE INDEX IF NOT EXISTS idx_lemma_word ON lemma_cache(word, target_language);
      CREATE INDEX IF NOT EXISTS idx_is_context_sentence ON examples(is_context_sentence);
    `);
  }

  /**
   * Migrate existing database to add context support
   */
  private migrateDatabase(): void {
    try {
      // Check if context columns exist and add them if they don't
      const tableInfo = this.db.prepare("PRAGMA table_info(entries)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
        pk: number;
      }>;

      const hasContextColumn = tableInfo.some(col => col.name === 'has_context');
      const hasContextSentenceColumn = tableInfo.some(col => col.name === 'context_sentence');

      if (!hasContextColumn) {
        console.log('Adding has_context column to entries table...');
        this.db.exec(`ALTER TABLE entries ADD COLUMN has_context INTEGER DEFAULT 0`);
      }

      if (!hasContextSentenceColumn) {
        console.log('Adding context_sentence column to entries table...');
        this.db.exec(`ALTER TABLE entries ADD COLUMN context_sentence TEXT`);
      }

      // Check examples table for context marking column
      const examplesTableInfo = this.db.prepare("PRAGMA table_info(examples)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
        pk: number;
      }>;

      const hasIsContextSentenceColumn = examplesTableInfo.some(col => col.name === 'is_context_sentence');

      if (!hasIsContextSentenceColumn) {
        console.log('Adding is_context_sentence column to examples table...');
        this.db.exec(`ALTER TABLE examples ADD COLUMN is_context_sentence INTEGER DEFAULT 0`);
      }

      // Update the UNIQUE constraint on entries table to include context fields
      // Note: SQLite doesn't support ALTER TABLE to modify constraints, so we only do this for new tables
      
    } catch (error) {
      console.warn('Database migration completed with some warnings:', error);
    }
  }

  /**
   * Add a new dictionary entry with context support
   */
  public addEntry(entry: DictionaryEntry): number | null {
    const transaction = this.db.transaction(() => {
      // Check if entry already exists (including context)
      const existingEntry = this.db.prepare(`
        SELECT id FROM entries 
        WHERE headword = ? AND source_language = ? AND target_language = ? AND definition_language = ?
        AND has_context = ? AND COALESCE(context_sentence, '') = ?
      `).get(
        entry.headword,
        entry.metadata.source_language,
        entry.metadata.target_language,
        entry.metadata.definition_language,
        entry.metadata.has_context ? 1 : 0,
        entry.metadata.context_sentence || ''
      ) as { id: number } | undefined;

      if (existingEntry) {
        return existingEntry.id;
      }

      // Insert new entry with context support
      const insertEntry = this.db.prepare(`
        INSERT INTO entries (headword, part_of_speech, source_language, target_language, definition_language, has_context, context_sentence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const partOfSpeech = Array.isArray(entry.part_of_speech) 
        ? JSON.stringify(entry.part_of_speech) 
        : entry.part_of_speech;

      const result = insertEntry.run(
        entry.headword,
        partOfSpeech,
        entry.metadata.source_language,
        entry.metadata.target_language,
        entry.metadata.definition_language,
        entry.metadata.has_context ? 1 : 0,
        entry.metadata.context_sentence || null
      );

      const entryId = result.lastInsertRowid as number;

      // Insert meanings
      const insertMeaning = this.db.prepare(`
        INSERT INTO meanings (entry_id, definition, noun_type, verb_type, comparison)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertExample = this.db.prepare(`
        INSERT INTO examples (meaning_id, sentence, translation, is_context_sentence)
        VALUES (?, ?, ?, ?)
      `);

      for (const meaning of entry.meanings) {
        const meaningResult = insertMeaning.run(
          entryId,
          meaning.definition,
          meaning.grammar.noun_type || null,
          meaning.grammar.verb_type || null,
          meaning.grammar.comparison || null
        );

        const meaningId = meaningResult.lastInsertRowid as number;

        // Insert examples with context marking
        for (const example of meaning.examples) {
          insertExample.run(
            meaningId,
            example.sentence,
            example.translation || null,
            example.is_context_sentence ? 1 : 0
          );
        }
      }

      return entryId;
    });

    try {
      return transaction();
    } catch (error) {
      console.error('Error adding entry:', error);
      return null;
    }
  }

  /**
   * Get entry by headword and language combination
   */
  public getEntryByHeadword(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    definitionLanguage?: string
  ): DictionaryEntry | null {
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

    query += ' ORDER BY created_at DESC LIMIT 1'; // Get most recent if multiple matches

    const entry = this.db.prepare(query).get(...params) as ExtendedDatabaseEntry | undefined;

    if (!entry) {
      return null;
    }

    return this.constructEntryObject(entry.id);
  }

  /**
   * Search entries with filters
   */
  public searchEntries(filters: SearchFilters, page = 1, pageSize = 50): SearchResult {
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
    // Keep definition language filter for backward compatibility, but make it optional
    if (filters.definitionLanguage && filters.definitionLanguage !== 'All') {
      query += ' AND definition_language = ?';
      params.push(filters.definitionLanguage);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const totalCount = this.db.prepare(countQuery).get(...params) as { 'COUNT(*)': number };
    const total = totalCount['COUNT(*)'];

    // Add pagination and ordering
    query += ' ORDER BY headword COLLATE NOCASE LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const entries = this.db.prepare(query).all(...params) as ExtendedDatabaseEntry[];

    return {
      entries: entries.map(entry => this.constructEntryObject(entry.id)).filter(Boolean) as DictionaryEntry[],
      total,
      page,
      pageSize
    };
  }

  /**
   * Get all unique languages
   */
  public getAllLanguages(): { sourceLanguages: string[], targetLanguages: string[], definitionLanguages: string[] } {
    const sourceLanguages = this.db.prepare('SELECT DISTINCT source_language FROM entries').all()
      .map((row: any) => row.source_language).filter(Boolean);
    
    const targetLanguages = this.db.prepare('SELECT DISTINCT target_language FROM entries').all()
      .map((row: any) => row.target_language).filter(Boolean);
    
    const definitionLanguages = this.db.prepare('SELECT DISTINCT definition_language FROM entries').all()
      .map((row: any) => row.definition_language).filter(Boolean);

    return {
      sourceLanguages,
      targetLanguages,
      definitionLanguages
    };
  }

  /**
   * Delete an entry
   */
  public deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string,
    definitionLanguage?: string
  ): boolean {
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
      const result = this.db.prepare(query).run(...params);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting entry:', error);
      return false;
    }
  }

  /**
   * Cache a lemma
   */
  public cacheLemma(word: string, lemma: string, targetLanguage: string): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO lemma_cache (word, lemma, target_language)
        VALUES (?, ?, ?)
      `).run(word, lemma, targetLanguage);
    } catch (error) {
      console.error('Error caching lemma:', error);
    }
  }

  /**
   * Get cached lemma
   */
  public getCachedLemma(word: string, targetLanguage: string): string | null {
    try {
      const result = this.db.prepare(`
        SELECT lemma FROM lemma_cache 
        WHERE word = ? AND target_language = ?
      `).get(word, targetLanguage) as { lemma: string } | undefined;

      return result?.lemma || null;
    } catch (error) {
      console.error('Error getting cached lemma:', error);
      return null;
    }
  }

  /**
   * Clear lemma cache
   */
  public clearLemmaCache(): void {
    try {
      this.db.prepare('DELETE FROM lemma_cache').run();
    } catch (error) {
      console.error('Error clearing lemma cache:', error);
    }
  }

  /**
   * Construct a complete entry object from database rows with context support
   */
  private constructEntryObject(entryId: number): DictionaryEntry | null {
    try {
      // Get entry details
      const entry = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as ExtendedDatabaseEntry;
      if (!entry) return null;

      // Get meanings
      const meanings = this.db.prepare('SELECT * FROM meanings WHERE entry_id = ?').all(entryId) as DatabaseMeaning[];

      const entryMeanings = meanings.map(meaning => {
        // Get examples for this meaning
        const examples = this.db.prepare('SELECT * FROM examples WHERE meaning_id = ?').all(meaning.id) as ExtendedDatabaseExample[];

        return {
          definition: meaning.definition,
          grammar: {
            noun_type: meaning.noun_type || undefined,
            verb_type: meaning.verb_type || undefined,
            comparison: meaning.comparison || undefined,
          },
          examples: examples.map(example => ({
            sentence: example.sentence,
            translation: example.translation || undefined,
            is_context_sentence: Boolean(example.is_context_sentence),
          })),
        };
      });

      // Parse part_of_speech (it's always a string from database)
      let partOfSpeech: string | string[];
      if (entry.part_of_speech) {
        try {
          // Try to parse as JSON (for arrays stored as strings)
          const parsed = JSON.parse(entry.part_of_speech);
          partOfSpeech = parsed;
        } catch {
          // If parsing fails, it's a plain string
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
    this.db.close();
  }
}

export default DatabaseManager;