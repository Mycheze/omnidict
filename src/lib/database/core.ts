import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Core database connection manager
 * Handles connection, optimization, and basic setup with proper migrations
 */
export class DatabaseCore {
  private db: Database.Database | null = null;
  private static instance: DatabaseCore;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  constructor() {
    // Don't call any methods that need the database in constructor
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DatabaseCore {
    if (!DatabaseCore.instance) {
      DatabaseCore.instance = new DatabaseCore();
    }
    return DatabaseCore.instance;
  }

  /**
   * Initialize database if not already initialized
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.db) {
      return; // Already initialized
    }

    if (this.initPromise) {
      return this.initPromise; // Already initializing
    }

    this.initPromise = this.initializeDatabase();
    await this.initPromise;
    this.isInitialized = true;
  }

  /**
   * Get the database instance - throws if not initialized
   */
  public getDatabase(): Database.Database {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call ensureInitialized() first.');
    }
    return this.db;
  }

  /**
   * Initialize database connection with proper error handling
   */
  private async initializeDatabase(): Promise<void> {
    try {
      console.log('Initializing local SQLite database...');
      const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dictionary.db');
      
      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      try {
        await fs.access(dbDir);
      } catch {
        await fs.mkdir(dbDir, { recursive: true });
        console.log('Created database directory:', dbDir);
      }
      
      // Create database connection
      this.db = new Database(dbPath);
      
      // Set critical performance pragmas first
      this.setPragmas();
      
      console.log('Local SQLite database initialized at:', dbPath);
      
      // Create tables and run migrations
      this.createTables();
      await this.runMigrations();
      this.optimizeDatabase();
      
    } catch (error) {
      console.error('Failed to initialize database:', error);
      if (this.db) {
        try {
          this.db.close();
        } catch (closeError) {
          console.error('Error closing database after init failure:', closeError);
        }
        this.db = null;
      }
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Set performance-critical pragmas
   */
  private setPragmas(): void {
    if (!this.db) return;
    
    try {
      // CRITICAL: Performance pragmas for scalability
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -64000'); // 64MB cache
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('mmap_size = 268435456'); // 256MB mmap
      this.db.pragma('foreign_keys = ON');
      
      console.log('Database pragmas set successfully');
    } catch (error) {
      console.warn('Failed to set some pragmas:', error);
    }
  }

  /**
   * Create database tables with base schema
   */
  private createTables(): void {
    if (!this.db) throw new Error('Database not available');
    
    const queries = [
      // Entries table - comprehensive version with all columns
      `CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        headword TEXT NOT NULL COLLATE NOCASE,
        part_of_speech TEXT NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        definition_language TEXT NOT NULL,
        has_context BOOLEAN DEFAULT FALSE,
        context_sentence TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(headword, source_language, target_language, COALESCE(context_sentence, ''))
      )`,
      
      // Meanings table - comprehensive version
      `CREATE TABLE IF NOT EXISTS meanings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        definition TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        noun_type TEXT,
        verb_type TEXT,
        comparison TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
      )`,
      
      // Examples table - comprehensive version
      `CREATE TABLE IF NOT EXISTS examples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meaning_id INTEGER NOT NULL,
        sentence TEXT NOT NULL,
        translation TEXT,
        is_context_sentence BOOLEAN DEFAULT FALSE,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
      )`,
      
      // Lemma cache - comprehensive version
      `CREATE TABLE IF NOT EXISTS lemma_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        lemma TEXT NOT NULL,
        target_language TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (datetime('now', '+24 hours')),
        UNIQUE(word, target_language)
      )`,
    ];

    for (const query of queries) {
      try {
        this.db.exec(query);
      } catch (error) {
        console.error('Error creating table:', error);
        throw error;
      }
    }
    
    console.log('Database tables created successfully');
  }

  /**
   * Run database migrations safely
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      console.log('Running database migrations...');
      
      // Migration 1: Add order_index to meanings table (safe)
      if (!this.columnExists('meanings', 'order_index')) {
        this.db.exec('ALTER TABLE meanings ADD COLUMN order_index INTEGER DEFAULT 0');
        console.log('✓ Added order_index column to meanings table');
        
        // Update existing data
        this.db.exec(`
          UPDATE meanings 
          SET order_index = (
            SELECT COUNT(*) FROM meanings m2 
            WHERE m2.entry_id = meanings.entry_id 
            AND m2.id < meanings.id
          ) 
          WHERE order_index = 0
        `);
      }

      // Migration 2: Add order_index to examples table (safe)
      if (!this.columnExists('examples', 'order_index')) {
        this.db.exec('ALTER TABLE examples ADD COLUMN order_index INTEGER DEFAULT 0');
        console.log('✓ Added order_index column to examples table');
        
        // Update existing data
        this.db.exec(`
          UPDATE examples 
          SET order_index = (
            SELECT COUNT(*) FROM examples e2 
            WHERE e2.meaning_id = examples.meaning_id 
            AND e2.id < examples.id
          ) 
          WHERE order_index = 0
        `);
      }

      // Migration 3: Add expires_at to lemma_cache table (safe)
      if (!this.columnExists('lemma_cache', 'expires_at')) {
        this.db.exec(`ALTER TABLE lemma_cache ADD COLUMN expires_at TIMESTAMP DEFAULT (datetime('now', '+24 hours'))`);
        console.log('✓ Added expires_at column to lemma_cache table');
        
        // Update existing cache entries to expire in 24 hours
        this.db.exec(`
          UPDATE lemma_cache 
          SET expires_at = datetime('now', '+24 hours')
          WHERE expires_at IS NULL
        `);
      }

      console.log('Database migrations completed successfully');
    } catch (error) {
      console.error('Error running migrations:', error);
      // Don't throw - allow app to continue with existing schema
    }
  }

  /**
   * Check if a column exists in a table (safe method)
   */
  private columnExists(tableName: string, columnName: string): boolean {
    if (!this.db) return false;
    
    try {
      const result = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{name: string}>;
      return result.some(col => col.name === columnName);
    } catch (error) {
      console.warn(`Error checking column ${columnName} in ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Optimize database with performance indexes
   */
  private optimizeDatabase(): void {
    if (!this.db) return;
    
    try {
      console.log('Optimizing database with composite indexes...');
      
      // Performance-critical indexes
      const indexes = [
        // Primary lookup index (most important)
        `CREATE INDEX IF NOT EXISTS idx_entries_lookup 
         ON entries(headword COLLATE NOCASE, source_language, target_language)`,
        
        // Language pair queries for browsing
        `CREATE INDEX IF NOT EXISTS idx_entries_languages 
         ON entries(source_language, target_language, created_at DESC)`,
        
        // Search optimization for filtering
        `CREATE INDEX IF NOT EXISTS idx_entries_search 
         ON entries(source_language, target_language, headword COLLATE NOCASE)`,
        
        // Context searches
        `CREATE INDEX IF NOT EXISTS idx_entries_context 
         ON entries(has_context, source_language, target_language) WHERE has_context = TRUE`,
        
        // Recent entries optimization
        `CREATE INDEX IF NOT EXISTS idx_entries_recent 
         ON entries(source_language, target_language, created_at DESC)`,
      ];

      // Add order-dependent indexes only if columns exist
      if (this.columnExists('meanings', 'order_index')) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_meanings_entry 
           ON meanings(entry_id, order_index)`
        );
      }
      
      if (this.columnExists('examples', 'order_index')) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_examples_meaning 
           ON examples(meaning_id, order_index)`
        );
      }
      
      // Cache indexes
      if (this.columnExists('lemma_cache', 'expires_at')) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_lemma_lookup 
           ON lemma_cache(word, target_language, expires_at)`
        );
      } else {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_lemma_lookup_basic 
           ON lemma_cache(word, target_language)`
        );
      }

      // Create indexes safely
      for (const indexQuery of indexes) {
        try {
          this.db.exec(indexQuery);
        } catch (error) {
          console.warn('Index creation warning (continuing):', error);
        }
      }
      
      // Update query planner statistics
      this.db.exec('ANALYZE');
      
      console.log('Database optimization completed successfully');
      
    } catch (error) {
      console.warn('Database optimization completed with warnings:', error);
      // Don't throw - optimization is not critical for functionality
    }
  }

  /**
   * Prepare commonly used statements for better performance
   */
  public prepareStatements() {
    const db = this.getDatabase();
    
    // Check column availability
    const hasOrderIndex = this.columnExists('meanings', 'order_index') && this.columnExists('examples', 'order_index');
    const hasExpiresAt = this.columnExists('lemma_cache', 'expires_at');
    
    // Base statements that always work
    const baseStatements = {
      getEntryByHeadword: db.prepare(`
        SELECT id FROM entries 
        WHERE headword = ? COLLATE NOCASE
        AND source_language = ? 
        AND target_language = ?
        ORDER BY created_at DESC LIMIT 1
      `),

      insertEntry: db.prepare(`
        INSERT INTO entries (headword, part_of_speech, source_language, target_language, definition_language, has_context, context_sentence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      // Optimized search query with ranking
      searchEntries: db.prepare(`
        SELECT 
          e.id, e.headword, e.source_language, e.target_language,
          CASE 
            WHEN e.headword = ? COLLATE NOCASE THEN 1
            WHEN e.headword LIKE ? || '%' COLLATE NOCASE THEN 2
            ELSE 3
          END as rank_score
        FROM entries e
        WHERE e.source_language = ? 
          AND e.target_language = ?
          AND (
            e.headword LIKE ? || '%' COLLATE NOCASE OR 
            e.headword LIKE '%' || ? || '%' COLLATE NOCASE
          )
        ORDER BY rank_score, e.headword COLLATE NOCASE
        LIMIT ? OFFSET ?
      `),
    } as any; // Use 'as any' to allow dynamic property addition

    // Conditional statements based on schema
    if (hasOrderIndex) {
      Object.assign(baseStatements, {
        getEntryById: db.prepare(`
          SELECT 
            e.id, e.headword, e.part_of_speech, e.source_language, e.target_language, 
            e.definition_language, e.has_context, e.context_sentence,
            m.id as meaning_id, m.definition, m.order_index as meaning_order,
            m.noun_type, m.verb_type, m.comparison,
            ex.id as example_id, ex.sentence, ex.translation, 
            ex.is_context_sentence, ex.order_index as example_order
          FROM entries e
          LEFT JOIN meanings m ON e.id = m.entry_id
          LEFT JOIN examples ex ON m.id = ex.meaning_id
          WHERE e.id = ?
          ORDER BY e.id, m.order_index, ex.order_index
        `),

        insertMeaning: db.prepare(`
          INSERT INTO meanings (entry_id, definition, order_index, noun_type, verb_type, comparison)
          VALUES (?, ?, ?, ?, ?, ?)
        `),

        insertExample: db.prepare(`
          INSERT INTO examples (meaning_id, sentence, translation, is_context_sentence, order_index)
          VALUES (?, ?, ?, ?, ?)
        `),
      });
    } else {
      Object.assign(baseStatements, {
        getEntryById: db.prepare(`
          SELECT 
            e.id, e.headword, e.part_of_speech, e.source_language, e.target_language, 
            e.definition_language, e.has_context, e.context_sentence,
            m.id as meaning_id, m.definition, 0 as meaning_order,
            m.noun_type, m.verb_type, m.comparison,
            ex.id as example_id, ex.sentence, ex.translation, 
            ex.is_context_sentence, 0 as example_order
          FROM entries e
          LEFT JOIN meanings m ON e.id = m.entry_id
          LEFT JOIN examples ex ON m.id = ex.meaning_id
          WHERE e.id = ?
          ORDER BY e.id, m.id, ex.id
        `),

        insertMeaning: db.prepare(`
          INSERT INTO meanings (entry_id, definition, noun_type, verb_type, comparison)
          VALUES (?, ?, ?, ?, ?)
        `),

        insertExample: db.prepare(`
          INSERT INTO examples (meaning_id, sentence, translation, is_context_sentence)
          VALUES (?, ?, ?, ?)
        `),
      });
    }

    // Cache operations based on schema
    if (hasExpiresAt) {
      Object.assign(baseStatements, {
        getCachedLemma: db.prepare(`
          SELECT lemma FROM lemma_cache 
          WHERE word = ? AND target_language = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        `),

        setCachedLemma: db.prepare(`
          INSERT OR REPLACE INTO lemma_cache (word, lemma, target_language, expires_at)
          VALUES (?, ?, ?, datetime('now', '+24 hours'))
        `),
      });
    } else {
      Object.assign(baseStatements, {
        getCachedLemma: db.prepare(`
          SELECT lemma FROM lemma_cache 
          WHERE word = ? AND target_language = ?
        `),

        setCachedLemma: db.prepare(`
          INSERT OR REPLACE INTO lemma_cache (word, lemma, target_language)
          VALUES (?, ?, ?)
        `),
      });
    }

    return baseStatements;
  }

  /**
   * Run database maintenance safely
   */
  public runMaintenance(): void {
    if (!this.db) return;
    
    try {
      console.log('Running database maintenance...');
      
      // Clean up expired lemma cache entries (only if expires_at column exists)
      if (this.columnExists('lemma_cache', 'expires_at')) {
        const result = this.db.prepare(`
          DELETE FROM lemma_cache 
          WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
        `).run();
        
        if (result.changes > 0) {
          console.log(`Cleaned up ${result.changes} expired cache entries`);
        }
      }
      
      // Update query planner statistics
      this.db.exec('ANALYZE');
      
      console.log('Database maintenance completed successfully');
    } catch (error) {
      console.error('Error during database maintenance:', error);
    }
  }

  /**
   * Get database statistics safely
   */
  public getDatabaseStats() {
    if (!this.db) {
      return {
        entryCount: 0,
        meaningCount: 0,
        exampleCount: 0,
        dbSize: '0 MB',
        cacheSize: 0,
      };
    }
    
    try {
      const entryCount = this.db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
      const meaningCount = this.db.prepare('SELECT COUNT(*) as count FROM meanings').get() as { count: number };
      const exampleCount = this.db.prepare('SELECT COUNT(*) as count FROM examples').get() as { count: number };
      const cacheCount = this.db.prepare('SELECT COUNT(*) as count FROM lemma_cache').get() as { count: number };
      
      // Get database file size safely
      let sizeMB = '0';
      try {
        const pageCount = this.db.prepare('PRAGMA page_count').get() as { page_count: number };
        const pageSize = this.db.prepare('PRAGMA page_size').get() as { page_size: number };
        const sizeBytes = pageCount.page_count * pageSize.page_size;
        sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      } catch (error) {
        console.warn('Could not get database size:', error);
      }
      
      return {
        entryCount: entryCount.count,
        meaningCount: meaningCount.count,
        exampleCount: exampleCount.count,
        dbSize: `${sizeMB} MB`,
        cacheSize: cacheCount.count,
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      return {
        entryCount: 0,
        meaningCount: 0,
        exampleCount: 0,
        dbSize: '0 MB',
        cacheSize: 0,
      };
    }
  }

  /**
   * Close database connection safely
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
        console.log('Database connection closed');
      } catch (error) {
        console.error('Error closing database:', error);
      } finally {
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
      }
    }
  }
}