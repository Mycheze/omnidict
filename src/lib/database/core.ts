import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import path from 'path';
import { promises as fs } from 'fs';

// Unified database interface that works with both SQLite and Turso
interface DatabaseInterface {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): Promise<void> | void;
  pragma?(pragma: string): any;
  close(): Promise<void> | void;
}

interface PreparedStatement {
  get(...params: any[]): Promise<any> | any;
  all(...params: any[]): Promise<any[]> | any[];
  run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> | { changes: number; lastInsertRowid: number | bigint };
}

// Wrapper for libSQL client to match better-sqlite3 interface
class LibSQLWrapper implements DatabaseInterface {
  constructor(private client: any) {}

  prepare(sql: string): PreparedStatement {
    return {
      get: async (...params: any[]) => {
        const result = await this.client.execute({ sql, args: params });
        return result.rows[0] || undefined;
      },
      all: async (...params: any[]) => {
        const result = await this.client.execute({ sql, args: params });
        return result.rows;
      },
      run: async (...params: any[]) => {
        const result = await this.client.execute({ sql, args: params });
        return {
          changes: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid || 0
        };
      }
    };
  }

  async exec(sql: string): Promise<void> {
    // Split multiple statements and execute them
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.client.execute(statement.trim());
      }
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

// Wrapper for better-sqlite3 to make it async-compatible
class SQLiteWrapper implements DatabaseInterface {
  constructor(private db: Database.Database) {}

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return {
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
      run: (...params: any[]) => stmt.run(...params)
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(pragma: string): any {
    return this.db.pragma(pragma);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Core database connection manager with environment detection
 */
export class DatabaseCore {
  private db: DatabaseInterface | null = null;
  private static instance: DatabaseCore;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isProduction = false;

  constructor() {
    // Detect production environment
    this.isProduction = process.env.NODE_ENV === 'production' || 
                       !!process.env.TURSO_DATABASE_URL ||
                       process.env.VERCEL === '1';
  }

  public static getInstance(): DatabaseCore {
    if (!DatabaseCore.instance) {
      DatabaseCore.instance = new DatabaseCore();
    }
    return DatabaseCore.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeDatabase();
    await this.initPromise;
    this.isInitialized = true;
  }

  public getDatabase(): DatabaseInterface {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call ensureInitialized() first.');
    }
    return this.db;
  }

  private async initializeDatabase(): Promise<void> {
    try {
      if (this.isProduction) {
        console.log('Initializing Turso database connection...');
        await this.initializeTurso();
      } else {
        console.log('Initializing local SQLite database...');
        await this.initializeLocal();
      }
      
      // Create tables and run migrations
      await this.createTables();
      await this.runMigrations();
      
      // Only optimize for local development
      if (!this.isProduction) {
        await this.optimizeDatabase();
      }
      
    } catch (error) {
      console.error('Failed to initialize database:', error);
      if (this.db) {
        try {
          await this.db.close();
        } catch (closeError) {
          console.error('Error closing database after init failure:', closeError);
        }
        this.db = null;
      }
      this.isInitialized = false;
      throw error;
    }
  }

  private async initializeTurso(): Promise<void> {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL environment variable is required in production');
    }

    try {
      const client = createClient({
        url,
        authToken, // Optional for local dev
      });

      // Test the connection
      await client.execute('SELECT 1');
      
      this.db = new LibSQLWrapper(client);
      console.log('Turso database connected successfully');
    } catch (error) {
      console.error('Failed to connect to Turso:', error);
      throw new Error(`Turso connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async initializeLocal(): Promise<void> {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dictionary.db');
    
    try {
      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      try {
        await fs.access(dbDir);
      } catch {
        await fs.mkdir(dbDir, { recursive: true });
        console.log('Created database directory:', dbDir);
      }
      
      // Create database connection
      const sqlite = new Database(dbPath);
      this.db = new SQLiteWrapper(sqlite);
      
      // Set performance pragmas for local development only
      this.setPragmas();
      
      console.log('Local SQLite database initialized at:', dbPath);
    } catch (error) {
      console.error('Failed to initialize local SQLite:', error);
      throw error;
    }
  }

  private setPragmas(): void {
    if (!this.db || this.isProduction) return;
    
    try {
      // Only set pragmas for local SQLite
      const sqliteWrapper = this.db as SQLiteWrapper;
      if (sqliteWrapper.pragma) {
        sqliteWrapper.pragma('journal_mode = WAL');
        sqliteWrapper.pragma('synchronous = NORMAL');
        sqliteWrapper.pragma('cache_size = -64000');
        sqliteWrapper.pragma('temp_store = MEMORY');
        sqliteWrapper.pragma('mmap_size = 268435456');
        sqliteWrapper.pragma('foreign_keys = ON');
        
        console.log('Database pragmas set successfully');
      }
    } catch (error) {
      console.warn('Failed to set some pragmas:', error);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    
    const queries = [
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
        await this.db.exec(query);
      } catch (error) {
        console.error('Error creating table:', error);
        throw error;
      }
    }
    
    console.log('Database tables created successfully');
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not available');
    
    try {
      console.log('Running database migrations...');
      
      // Migration 1: Add order_index to meanings table (safe)
      if (!(await this.columnExists('meanings', 'order_index'))) {
        await this.db.exec('ALTER TABLE meanings ADD COLUMN order_index INTEGER DEFAULT 0');
        console.log('✓ Added order_index column to meanings table');
        
        // Update existing data
        await this.db.exec(`
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
      if (!(await this.columnExists('examples', 'order_index'))) {
        await this.db.exec('ALTER TABLE examples ADD COLUMN order_index INTEGER DEFAULT 0');
        console.log('✓ Added order_index column to examples table');
        
        // Update existing data
        await this.db.exec(`
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
      if (!(await this.columnExists('lemma_cache', 'expires_at'))) {
        await this.db.exec(`ALTER TABLE lemma_cache ADD COLUMN expires_at TIMESTAMP DEFAULT (datetime('now', '+24 hours'))`);
        console.log('✓ Added expires_at column to lemma_cache table');
        
        // Update existing cache entries to expire in 24 hours
        await this.db.exec(`
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

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    if (!this.db) return false;
    
    try {
      const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
      const result = await stmt.all() as Array<{name: string}>;
      return result.some(col => col.name === columnName);
    } catch (error) {
      console.warn(`Error checking column ${columnName} in ${tableName}:`, error);
      return false;
    }
  }

  private async optimizeDatabase(): Promise<void> {
    if (!this.db || this.isProduction) return;
    
    try {
      console.log('Optimizing database with composite indexes...');
      
      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_entries_lookup 
         ON entries(headword COLLATE NOCASE, source_language, target_language)`,
        
        `CREATE INDEX IF NOT EXISTS idx_entries_languages 
         ON entries(source_language, target_language, created_at DESC)`,
        
        `CREATE INDEX IF NOT EXISTS idx_entries_search 
         ON entries(source_language, target_language, headword COLLATE NOCASE)`,
        
        `CREATE INDEX IF NOT EXISTS idx_entries_context 
         ON entries(has_context, source_language, target_language) WHERE has_context = TRUE`,
        
        `CREATE INDEX IF NOT EXISTS idx_entries_recent 
         ON entries(source_language, target_language, created_at DESC)`,
      ];

      // Add order-dependent indexes only if columns exist
      if (await this.columnExists('meanings', 'order_index')) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_meanings_entry 
           ON meanings(entry_id, order_index)`
        );
      }
      
      if (await this.columnExists('examples', 'order_index')) {
        indexes.push(
          `CREATE INDEX IF NOT EXISTS idx_examples_meaning 
           ON examples(meaning_id, order_index)`
        );
      }
      
      // Cache indexes
      if (await this.columnExists('lemma_cache', 'expires_at')) {
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
          await this.db.exec(indexQuery);
        } catch (error) {
          console.warn('Index creation warning (continuing):', error);
        }
      }
      
      // Update query planner statistics
      await this.db.exec('ANALYZE');
      
      console.log('Database optimization completed successfully');
      
    } catch (error) {
      console.warn('Database optimization completed with warnings:', error);
    }
  }

  public prepareStatements() {
    const db = this.getDatabase();
    
    // For async compatibility, we'll prepare these on-demand
    return {
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
        ORDER BY e.id, COALESCE(m.order_index, 0), COALESCE(ex.order_index, 0)
      `),

      insertMeaning: db.prepare(`
        INSERT INTO meanings (entry_id, definition, order_index, noun_type, verb_type, comparison)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      insertExample: db.prepare(`
        INSERT INTO examples (meaning_id, sentence, translation, is_context_sentence, order_index)
        VALUES (?, ?, ?, ?, ?)
      `),

      getCachedLemma: db.prepare(`
        SELECT lemma FROM lemma_cache 
        WHERE word = ? AND target_language = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `),

      setCachedLemma: db.prepare(`
        INSERT OR REPLACE INTO lemma_cache (word, lemma, target_language, expires_at)
        VALUES (?, ?, ?, datetime('now', '+24 hours'))
      `),
    };
  }

  public async runMaintenance(): Promise<void> {
    if (!this.db) return;
    
    try {
      console.log('Running database maintenance...');
      
      // Clean up expired lemma cache entries
      if (await this.columnExists('lemma_cache', 'expires_at')) {
        const stmt = this.db.prepare(`
          DELETE FROM lemma_cache 
          WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
        `);
        const result = await stmt.run();
        
        if (result.changes > 0) {
          console.log(`Cleaned up ${result.changes} expired cache entries`);
        }
      }
      
      // Update query planner statistics
      await this.db.exec('ANALYZE');
      
      console.log('Database maintenance completed successfully');
    } catch (error) {
      console.error('Error during database maintenance:', error);
    }
  }

  public async getDatabaseStats() {
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
      const entryStmt = this.db.prepare('SELECT COUNT(*) as count FROM entries');
      const meaningStmt = this.db.prepare('SELECT COUNT(*) as count FROM meanings');
      const exampleStmt = this.db.prepare('SELECT COUNT(*) as count FROM examples');
      const cacheStmt = this.db.prepare('SELECT COUNT(*) as count FROM lemma_cache');
      
      const [entryCount, meaningCount, exampleCount, cacheCount] = await Promise.all([
        entryStmt.get(),
        meaningStmt.get(),
        exampleStmt.get(),
        cacheStmt.get()
      ]);
      
      // Database size is only available for local SQLite
      let sizeMB = '0';
      if (!this.isProduction) {
        try {
          const pageCountStmt = this.db.prepare('PRAGMA page_count');
          const pageSizeStmt = this.db.prepare('PRAGMA page_size');
          const [pageCount, pageSize] = await Promise.all([
            pageCountStmt.get(),
            pageSizeStmt.get()
          ]);
          
          if (pageCount && pageSize) {
            const sizeBytes = (pageCount as any).page_count * (pageSize as any).page_size;
            sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
          }
        } catch (error) {
          console.warn('Could not get database size:', error);
        }
      } else {
        sizeMB = 'N/A (remote)';
      }
      
      return {
        entryCount: (entryCount as any).count,
        meaningCount: (meaningCount as any).count,
        exampleCount: (exampleCount as any).count,
        dbSize: `${sizeMB} MB`,
        cacheSize: (cacheCount as any).count,
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

  public async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.close();
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