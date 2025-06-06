import { DatabaseCore } from '../core';
import { DictionaryEntry, DatabaseEntry, DatabaseMeaning, DatabaseExample } from '@/lib/types';

// Composite result type for JOIN queries
interface JoinedEntryRow {
  id: number;
  headword: string;
  part_of_speech: string;
  source_language: string;
  target_language: string;
  definition_language: string;
  has_context: number;
  context_sentence: string | null;
  meaning_id: number | null;
  definition: string | null;
  meaning_order: number | null;
  noun_type: string | null;
  verb_type: string | null;
  comparison: string | null;
  example_id: number | null;
  sentence: string | null;
  translation: string | null;
  is_context_sentence: number | null;
  example_order: number | null;
}

/**
 * Repository for entry operations with async support for both SQLite and Turso
 */
export class EntryRepository {
  private core: DatabaseCore;
  private statements: ReturnType<DatabaseCore['prepareStatements']> | null = null;

  constructor(core: DatabaseCore) {
    this.core = core;
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
   * Add a new dictionary entry with context support using prepared statements
   */
  public async addEntry(entry: DictionaryEntry): Promise<number | null> {
    try {
      const db = this.core.getDatabase();
      
      // Check if entry already exists
      const existingEntry = await this.getEntryByHeadword(
        entry.headword,
        entry.metadata.source_language,
        entry.metadata.target_language
      );

      if (existingEntry) {
        return null; // Entry already exists
      }

      const statements = this.getStatements();

      // For async compatibility, we need to handle transactions differently
      // SQLite supports transactions, but Turso might not in the same way
      try {
        // Insert new entry
        const partOfSpeech = Array.isArray(entry.part_of_speech) 
          ? JSON.stringify(entry.part_of_speech) 
          : entry.part_of_speech;

        const entryResult = await statements.insertEntry.run(
          entry.headword,
          partOfSpeech,
          entry.metadata.source_language,
          entry.metadata.target_language,
          entry.metadata.definition_language,
          entry.metadata.has_context ? 1 : 0,
          entry.metadata.context_sentence || null
        );

        const entryId = Number(entryResult.lastInsertRowid);

        // Insert meanings and examples
        for (let meaningIndex = 0; meaningIndex < entry.meanings.length; meaningIndex++) {
          const meaning = entry.meanings[meaningIndex];
          
          const meaningResult = await statements.insertMeaning.run(
            entryId,
            meaning.definition,
            meaningIndex,
            meaning.grammar.noun_type || null,
            meaning.grammar.verb_type || null,
            meaning.grammar.comparison || null
          );

          const meaningId = Number(meaningResult.lastInsertRowid);

          // Insert examples
          for (let exampleIndex = 0; exampleIndex < meaning.examples.length; exampleIndex++) {
            const example = meaning.examples[exampleIndex];
            
            await statements.insertExample.run(
              meaningId,
              example.sentence,
              example.translation || null,
              example.is_context_sentence ? 1 : 0,
              exampleIndex
            );
          }
        }

        return entryId;
      } catch (error) {
        console.error('Error in entry transaction:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error adding entry:', error);
      return null;
    }
  }

  /**
   * Get entry by headword using optimized composite index and prepared statement
   */
  public async getEntryByHeadword(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<DictionaryEntry | null> {
    try {
      if (!sourceLanguage || !targetLanguage) {
        return null;
      }

      const statements = this.getStatements();
      const result = await statements.getEntryByHeadword.get(
        headword, sourceLanguage, targetLanguage
      ) as { id: number } | undefined;

      if (!result) {
        return null;
      }

      return await this.getEntryById(result.id);
    } catch (error) {
      console.error('Error getting entry by headword:', error);
      return null;
    }
  }

  /**
   * Get entry by ID using optimized JOIN query
   */
  public async getEntryById(entryId: number): Promise<DictionaryEntry | null> {
    try {
      const statements = this.getStatements();
      const rows = await statements.getEntryById.all(entryId) as JoinedEntryRow[];

      if (rows.length === 0) return null;

      return this.constructEntryFromJoinedRows(rows);
    } catch (error) {
      console.error('Error getting entry by ID:', error);
      return null;
    }
  }

  /**
   * Update an existing entry
   */
  public async updateEntry(entryId: number, entry: DictionaryEntry): Promise<boolean> {
    try {
      const db = this.core.getDatabase();
      
      // For updates, we need to be more careful about async operations
      try {
        // Update main entry
        const partOfSpeech = Array.isArray(entry.part_of_speech) 
          ? JSON.stringify(entry.part_of_speech) 
          : entry.part_of_speech;

        const updateEntryStmt = db.prepare(`
          UPDATE entries SET 
            headword = ?, 
            part_of_speech = ?, 
            source_language = ?, 
            target_language = ?, 
            definition_language = ?,
            has_context = ?,
            context_sentence = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        await updateEntryStmt.run(
          entry.headword,
          partOfSpeech,
          entry.metadata.source_language,
          entry.metadata.target_language,
          entry.metadata.definition_language,
          entry.metadata.has_context ? 1 : 0,
          entry.metadata.context_sentence || null,
          entryId
        );

        // Delete existing meanings and examples
        const deleteMeaningsStmt = db.prepare('DELETE FROM meanings WHERE entry_id = ?');
        await deleteMeaningsStmt.run(entryId);

        // Insert new meanings and examples using prepared statements
        const statements = this.getStatements();
        for (let meaningIndex = 0; meaningIndex < entry.meanings.length; meaningIndex++) {
          const meaning = entry.meanings[meaningIndex];
          
          const meaningResult = await statements.insertMeaning.run(
            entryId,
            meaning.definition,
            meaningIndex,
            meaning.grammar.noun_type || null,
            meaning.grammar.verb_type || null,
            meaning.grammar.comparison || null
          );

          const meaningId = Number(meaningResult.lastInsertRowid);

          // Insert examples
          for (let exampleIndex = 0; exampleIndex < meaning.examples.length; exampleIndex++) {
            const example = meaning.examples[exampleIndex];
            
            await statements.insertExample.run(
              meaningId,
              example.sentence,
              example.translation || null,
              example.is_context_sentence ? 1 : 0,
              exampleIndex
            );
          }
        }

        return true;
      } catch (error) {
        console.error('Error in update transaction:', error);
        return false;
      }
    } catch (error) {
      console.error('Error updating entry:', error);
      return false;
    }
  }

  /**
   * Delete an entry efficiently
   */
  public async deleteEntry(
    headword: string,
    sourceLanguage?: string,
    targetLanguage?: string
  ): Promise<boolean> {
    try {
      const db = this.core.getDatabase();
      
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

      const stmt = db.prepare(query);
      const result = await stmt.run(...params);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting entry:', error);
      return false;
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
  ): Promise<{ entries: DictionaryEntry[]; total: number }> {
    try {
      const db = this.core.getDatabase();
      
      // Get total count
      const countStmt = db.prepare(`
        SELECT COUNT(*) as count FROM entries 
        WHERE source_language = ? AND target_language = ?
      `);
      const countResult = await countStmt.get(sourceLanguage, targetLanguage) as { count: number };
      
      // Get entries
      const entriesStmt = db.prepare(`
        SELECT id FROM entries 
        WHERE source_language = ? AND target_language = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      const rows = await entriesStmt.all(
        sourceLanguage, 
        targetLanguage, 
        pageSize, 
        (page - 1) * pageSize
      ) as Array<{ id: number }>;

      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.getEntryById(row.id);
        if (entry) entries.push(entry);
      }

      return {
        entries,
        total: countResult.count,
      };
    } catch (error) {
      console.error('Error getting entries for languages:', error);
      return { entries: [], total: 0 };
    }
  }

  /**
   * Get recent entries (last 30 days) for language pair
   */
  public async getRecentEntries(
    sourceLanguage: string,
    targetLanguage: string,
    limit = 10
  ): Promise<DictionaryEntry[]> {
    try {
      const db = this.core.getDatabase();
      
      const stmt = db.prepare(`
        SELECT id FROM entries 
        WHERE source_language = ? AND target_language = ?
        AND created_at > datetime('now', '-30 days')
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      
      const rows = await stmt.all(sourceLanguage, targetLanguage, limit) as Array<{ id: number }>;
      
      const entries: DictionaryEntry[] = [];
      for (const row of rows) {
        const entry = await this.getEntryById(row.id);
        if (entry) entries.push(entry);
      }
      
      return entries;
    } catch (error) {
      console.error('Error getting recent entries:', error);
      return [];
    }
  }

  /**
   * Get all unique languages efficiently
   */
  public async getAllLanguages(): Promise<{ 
    sourceLanguages: string[]; 
    targetLanguages: string[]; 
    definitionLanguages: string[] 
  }> {
    try {
      const db = this.core.getDatabase();
      
      const stmt = db.prepare(`
        SELECT DISTINCT 
          source_language,
          target_language,
          definition_language
        FROM entries
        WHERE source_language IS NOT NULL 
        AND target_language IS NOT NULL
      `);
      
      const result = await stmt.all() as Array<{
        source_language: string;
        target_language: string;
        definition_language: string;
      }>;

      const sourceLanguages = new Set<string>();
      const targetLanguages = new Set<string>();
      const definitionLanguages = new Set<string>();

      result.forEach(row => {
        if (row.source_language) sourceLanguages.add(row.source_language);
        if (row.target_language) targetLanguages.add(row.target_language);
        if (row.definition_language) definitionLanguages.add(row.definition_language);
      });

      return {
        sourceLanguages: Array.from(sourceLanguages).sort(),
        targetLanguages: Array.from(targetLanguages).sort(),
        definitionLanguages: Array.from(definitionLanguages).sort()
      };
    } catch (error) {
      console.error('Error getting languages:', error);
      return { sourceLanguages: [], targetLanguages: [], definitionLanguages: [] };
    }
  }

  /**
   * Build DictionaryEntry from joined query results efficiently
   */
  private constructEntryFromJoinedRows(rows: JoinedEntryRow[]): DictionaryEntry {
    const firstRow = rows[0];
    
    // Parse part_of_speech
    let partOfSpeech: string | string[];
    try {
      partOfSpeech = firstRow.part_of_speech ? JSON.parse(firstRow.part_of_speech) : 'unknown';
    } catch {
      partOfSpeech = firstRow.part_of_speech || 'unknown';
    }

    // Group by meanings using Map for better performance
    const meaningsMap = new Map();
    const processedExamples = new Set<string>(); // Prevent duplicate examples
    
    rows.forEach(row => {
      if (!row.meaning_id) return; // Skip if no meanings
      
      if (!meaningsMap.has(row.meaning_id)) {
        meaningsMap.set(row.meaning_id, {
          definition: row.definition,
          grammar: {
            noun_type: row.noun_type || undefined,
            verb_type: row.verb_type || undefined,
            comparison: row.comparison || undefined,
          },
          examples: []
        });
      }
      
      if (row.example_id && row.sentence) {
        const meaning = meaningsMap.get(row.meaning_id);
        const exampleKey = `${row.meaning_id}-${row.sentence}`;
        
        // Avoid duplicate examples
        if (!processedExamples.has(exampleKey)) {
          processedExamples.add(exampleKey);
          meaning.examples.push({
            sentence: row.sentence,
            translation: row.translation || undefined,
            is_context_sentence: Boolean(row.is_context_sentence),
          });
        }
      }
    });

    return {
      metadata: {
        source_language: firstRow.source_language,
        target_language: firstRow.target_language,
        definition_language: firstRow.definition_language,
        has_context: Boolean(firstRow.has_context),
        context_sentence: firstRow.context_sentence || undefined,
      },
      headword: firstRow.headword,
      part_of_speech: partOfSpeech,
      meanings: Array.from(meaningsMap.values()),
    };
  }

  /**
   * Check if an entry exists
   */
  public async entryExists(
    headword: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<boolean> {
    try {
      const statements = this.getStatements();
      const result = await statements.getEntryByHeadword.get(
        headword, sourceLanguage, targetLanguage
      ) as { id: number } | undefined;

      return !!result;
    } catch (error) {
      console.error('Error checking if entry exists:', error);
      return false;
    }
  }

  /**
   * Get entry count for a language pair
   */
  public async getEntryCount(sourceLanguage: string, targetLanguage: string): Promise<number> {
    try {
      const db = this.core.getDatabase();
      const stmt = db.prepare(`
        SELECT COUNT(*) as count FROM entries 
        WHERE source_language = ? AND target_language = ?
      `);
      const result = await stmt.get(sourceLanguage, targetLanguage) as { count: number };

      return result.count;
    } catch (error) {
      console.error('Error getting entry count:', error);
      return 0;
    }
  }
}