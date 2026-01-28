import { DictionaryEntry, LemmaResponse } from '@/lib/types';

/**
 * Configuration for AI provider
 */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

/**
 * Result from provider operations
 */
export interface ProviderTestResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Base interface for all AI model providers
 */
export interface ModelProvider {
  /**
   * Test the connection/API key
   */
  testConnection(): Promise<ProviderTestResult>;

  /**
   * Generate a new dictionary entry
   */
  generateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null>;

  /**
   * Regenerate an existing entry with variation
   */
  regenerateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null>;

  /**
   * Get lemma form of a word
   */
  getLemma(params: {
    word: string;
    targetLanguage: string;
  }): Promise<LemmaResponse>;

  /**
   * Get lemma form with context
   */
  getLemmaWithContext(params: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
  }): Promise<LemmaResponse>;

  /**
   * Generate a context-aware dictionary entry
   */
  generateContextualEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
    contextSentence: string;
  }): Promise<DictionaryEntry | null>;

  /**
   * Validate a language name
   */
  validateLanguage(languageName: string): Promise<{
    standardizedName: string;
    displayName: string;
  }>;
}
