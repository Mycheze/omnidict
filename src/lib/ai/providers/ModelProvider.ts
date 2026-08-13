import { DictionaryEntry, ImageStyle, LemmaResponse } from "@/lib/types";

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
   * Resolve a word (in either the base or target language, possibly
   * inflected) to its TARGET-language dictionary lemma.
   */
  getLemma(params: {
    word: string;
    targetLanguage: string;
    /** Base/definition language of the learner. Defaults to English. */
    sourceLanguage?: string;
  }): Promise<LemmaResponse>;

  /**
   * Resolve a word to its TARGET-language dictionary lemma using sentence
   * context.
   */
  getLemmaWithContext(params: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
    /** Base/definition language of the learner. Defaults to English. */
    sourceLanguage?: string;
  }): Promise<LemmaResponse>;

  /**
   * Generate a context-aware dictionary entry.
   * Pass `lemma` when the caller already resolved it to avoid a duplicate
   * lemmatization call.
   */
  generateContextualEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
    contextSentence: string;
    lemma?: string;
  }): Promise<DictionaryEntry | null>;

  /**
   * Write an image-generation prompt for a word's meaning (null = skip render)
   */
  generateImagePrompt(params: {
    headword: string;
    definition: string;
    exampleSentence?: string;
    style: ImageStyle;
  }): Promise<string | null>;
}
