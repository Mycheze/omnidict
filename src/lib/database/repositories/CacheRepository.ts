import { DatabaseCore } from '../core';

/**
 * Repository for caching operations with async support
 */
export class CacheRepository {
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
   * Cache a lemma efficiently with expiration (if supported)
   */
  public async cacheLemma(word: string, lemma: string, targetLanguage: string): Promise<void> {
    try {
      const statements = this.getStatements();
      await statements.setCachedLemma.run(word, lemma, targetLanguage);
      console.log('Cached lemma:', word, '→', lemma, 'for', targetLanguage);
    } catch (error) {
      console.error('Error caching lemma:', error);
    }
  }

  /**
   * Get cached lemma efficiently
   */
  public async getCachedLemma(word: string, targetLanguage: string): Promise<string | null> {
    try {
      const statements = this.getStatements();
      const result = await statements.getCachedLemma.get(word, targetLanguage) as { lemma: string } | undefined;
      return result ? result.lemma : null;
    } catch (error) {
      console.error('Error getting cached lemma:', error);
      return null;
    }
  }

  /**
   * Clear expired lemma cache entries (only if expires_at column exists)
   */
  public async clearExpiredLemmaCache(): Promise<number> {
    try {
      const db = this.core.getDatabase();
      
      // Check if expires_at column exists
      const tableInfoStmt = db.prepare("PRAGMA table_info(lemma_cache)");
      const tableInfo = await tableInfoStmt.all() as Array<{name: string}>;
      const hasExpiresAt = tableInfo.some(col => col.name === 'expires_at');
      
      if (!hasExpiresAt) {
        console.log('expires_at column not found in lemma_cache, skipping expired cleanup');
        return 0;
      }
      
      const stmt = db.prepare(`
        DELETE FROM lemma_cache 
        WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
      `);
      const result = await stmt.run();
      
      if (result.changes > 0) {
        console.log('Cleared', result.changes, 'expired lemma cache entries');
      }
      
      return result.changes;
    } catch (error) {
      console.error('Error clearing expired lemma cache:', error);
      return 0;
    }
  }

  /**
   * Clear all lemma cache
   */
  public async clearLemmaCache(): Promise<void> {
    try {
      const db = this.core.getDatabase();
      const stmt = db.prepare('DELETE FROM lemma_cache');
      await stmt.run();
      console.log('Cleared all lemma cache');
    } catch (error) {
      console.error('Error clearing lemma cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    cacheHitRate: number;
  }> {
    try {
      const db = this.core.getDatabase();
      
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM lemma_cache');
      const total = await totalStmt.get() as { count: number };
      
      // Check if expires_at column exists
      const tableInfoStmt = db.prepare("PRAGMA table_info(lemma_cache)");
      const tableInfo = await tableInfoStmt.all() as Array<{name: string}>;
      const hasExpiresAt = tableInfo.some(col => col.name === 'expires_at');
      
      let expired = { count: 0 };
      if (hasExpiresAt) {
        const expiredStmt = db.prepare(`
          SELECT COUNT(*) as count FROM lemma_cache 
          WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
        `);
        expired = await expiredStmt.get() as { count: number };
      }
      
      // Calculate hit rate (simplified - in production, you'd track actual hits/misses)
      const hitRate = total.count > 0 ? Math.max(0, (total.count - expired.count) / total.count) : 0;
      
      return {
        totalEntries: total.count,
        expiredEntries: expired.count,
        cacheHitRate: hitRate,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { totalEntries: 0, expiredEntries: 0, cacheHitRate: 0 };
    }
  }

  /**
   * Optimize cache by removing old entries
   */
  public async optimizeCache(maxAge = 7): Promise<void> {
    try {
      const db = this.core.getDatabase();
      
      // Remove entries older than maxAge days
      const stmt = db.prepare(`
        DELETE FROM lemma_cache 
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `);
      const result = await stmt.run(maxAge);
      
      if (result.changes > 0) {
        console.log('Optimized cache: removed', result.changes, 'old entries');
      }
    } catch (error) {
      console.error('Error optimizing cache:', error);
    }
  }

  /**
   * Get cache size and performance metrics
   */
  public async getCacheMetrics(): Promise<{
    totalEntries: number;
    oldEntries: number;
    averageAge: number;
    topLanguages: Array<{ language: string; count: number }>;
  }> {
    try {
      const db = this.core.getDatabase();
      
      // Total entries
      const totalStmt = db.prepare('SELECT COUNT(*) as count FROM lemma_cache');
      const total = await totalStmt.get() as { count: number };
      
      // Old entries (older than 7 days)
      const oldStmt = db.prepare(`
        SELECT COUNT(*) as count FROM lemma_cache 
        WHERE created_at < datetime('now', '-7 days')
      `);
      const old = await oldStmt.get() as { count: number };
      
      // Average age in hours
      const avgAgeStmt = db.prepare(`
        SELECT AVG((julianday('now') - julianday(created_at)) * 24) as hours 
        FROM lemma_cache
      `);
      const avgAge = await avgAgeStmt.get() as { hours: number };
      
      // Top languages by cache usage
      const topLangsStmt = db.prepare(`
        SELECT target_language as language, COUNT(*) as count 
        FROM lemma_cache 
        GROUP BY target_language 
        ORDER BY count DESC 
        LIMIT 5
      `);
      const topLangs = await topLangsStmt.all() as Array<{ language: string; count: number }>;
      
      return {
        totalEntries: total.count,
        oldEntries: old.count,
        averageAge: avgAge.hours || 0,
        topLanguages: topLangs,
      };
    } catch (error) {
      console.error('Error getting cache metrics:', error);
      return {
        totalEntries: 0,
        oldEntries: 0,
        averageAge: 0,
        topLanguages: [],
      };
    }
  }

  /**
   * Preload frequently used lemmas (performance optimization)
   */
  public async preloadFrequentLemmas(limit = 100): Promise<Map<string, string>> {
    try {
      const db = this.core.getDatabase();
      
      // Get most recently used or frequently accessed lemmas
      const stmt = db.prepare(`
        SELECT word, lemma, target_language
        FROM lemma_cache 
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      const results = await stmt.all(limit) as Array<{ word: string; lemma: string; target_language: string }>;
      
      const preloadMap = new Map<string, string>();
      results.forEach(row => {
        const key = `${row.word}:${row.target_language}`;
        preloadMap.set(key, row.lemma);
      });
      
      console.log(`Preloaded ${preloadMap.size} frequent lemmas`);
      return preloadMap;
    } catch (error) {
      console.error('Error preloading frequent lemmas:', error);
      return new Map();
    }
  }

  /**
   * Bulk cache multiple lemmas (for batch operations)
   */
  public async bulkCacheLemmas(lemmas: Array<{
    word: string;
    lemma: string;
    targetLanguage: string;
  }>): Promise<number> {
    try {
      const statements = this.getStatements();
      
      let cached = 0;
      for (const item of lemmas) {
        try {
          await statements.setCachedLemma.run(item.word, item.lemma, item.targetLanguage);
          cached++;
        } catch (error) {
          console.warn('Failed to cache lemma:', item.word, error);
        }
      }
      
      console.log(`Bulk cached ${cached} lemmas out of ${lemmas.length} requested`);
      return cached;
    } catch (error) {
      console.error('Error in bulk cache operation:', error);
      return 0;
    }
  }

  /**
   * Check cache health and suggest maintenance
   */
  public async checkCacheHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    try {
      const metrics = await this.getCacheMetrics();
      const stats = await this.getCacheStats();
      
      const issues: string[] = [];
      const suggestions: string[] = [];
      
      // Check for too many old entries
      if (metrics.oldEntries > metrics.totalEntries * 0.5) {
        issues.push('More than 50% of cache entries are older than 7 days');
        suggestions.push('Run cache optimization to remove old entries');
      }
      
      // Check cache size
      if (metrics.totalEntries > 10000) {
        issues.push('Cache has grown very large (>10k entries)');
        suggestions.push('Consider reducing cache retention period');
      }
      
      // Check for low hit rate
      if (stats.cacheHitRate < 0.7) {
        issues.push('Cache hit rate is below 70%');
        suggestions.push('Review lemma access patterns and cache strategy');
      }
      
      // Check average age
      if (metrics.averageAge > 168) { // 7 days in hours
        issues.push('Average cache entry age is very high');
        suggestions.push('Implement more aggressive cache cleanup');
      }
      
      return {
        healthy: issues.length === 0,
        issues,
        suggestions,
      };
    } catch (error) {
      console.error('Error checking cache health:', error);
      return {
        healthy: false,
        issues: ['Failed to analyze cache health'],
        suggestions: ['Check database connectivity and try again'],
      };
    }
  }
}