import {
  DictionaryEntry,
  ImageStyle,
  LemmaRequest,
  LemmaResponse,
  ContextualEntryGenerationRequest,
} from "@/lib/types";
import {
  createProvider,
  AIProviderType,
  ProviderConfig,
  ModelProvider,
} from "./providers";

// Simplified interface for entry generation
interface SimplifiedEntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * Configuration for AIManager
 */
export interface AIManagerConfig {
  providerType?: AIProviderType;
  apiKey?: string;
  model?: string;
}

/**
 * AIManager - Coordinates AI operations using configured provider
 */
class AIManager {
  private provider: ModelProvider;
  private static instance: AIManager | null = null;

  constructor(config?: AIManagerConfig) {
    const finalConfig = config || {};

    // Default to DeepSeek (server env key)
    const providerType: AIProviderType = finalConfig.providerType || "deepseek";

    // Always pass the full config through: the model selection must never be
    // dropped. Providers with an env fallback treat an empty apiKey as "use
    // the server key"; an empty model falls back to the provider default.
    const providerConfig: ProviderConfig = {
      apiKey: finalConfig.apiKey || "",
      model: finalConfig.model || "",
    };

    this.provider = createProvider(providerType, providerConfig);
  }

  /**
   * Get singleton instance of AIManager (default provider + env key)
   */
  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  /**
   * Create a new provider instance without mutating the singleton.
   * Use this for per-request provider configuration to avoid race conditions.
   */
  public static createProviderInstance(config: AIManagerConfig): AIManager {
    return new AIManager(config);
  }

  /**
   * Get lemma form of a word
   */
  public async getLemma({
    word,
    targetLanguage,
    sourceLanguage,
  }: LemmaRequest): Promise<LemmaResponse> {
    return this.provider.getLemma({ word, targetLanguage, sourceLanguage });
  }

  /**
   * Generate a new dictionary entry
   */
  public async generateEntry({
    word,
    sourceLanguage,
    targetLanguage,
  }: SimplifiedEntryGenerationRequest): Promise<DictionaryEntry | null> {
    return this.provider.generateEntry({
      word,
      sourceLanguage,
      targetLanguage,
    });
  }

  /**
   * Regenerate an existing entry with variation
   */
  public async regenerateEntry({
    word,
    sourceLanguage,
    targetLanguage,
  }: SimplifiedEntryGenerationRequest): Promise<DictionaryEntry | null> {
    return this.provider.regenerateEntry({
      word,
      sourceLanguage,
      targetLanguage,
    });
  }

  /**
   * Get lemma form of a word with context
   */
  public async getLemmaWithContext({
    word,
    contextSentence,
    targetLanguage,
    sourceLanguage,
  }: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
    sourceLanguage?: string;
  }): Promise<LemmaResponse> {
    return this.provider.getLemmaWithContext({
      word,
      contextSentence,
      targetLanguage,
      sourceLanguage,
    });
  }

  /**
   * Generate a context-aware dictionary entry
   */
  public async generateContextualEntry({
    word,
    sourceLanguage,
    targetLanguage,
    contextSentence,
    lemma,
  }: ContextualEntryGenerationRequest & {
    lemma?: string;
  }): Promise<DictionaryEntry | null> {
    return this.provider.generateContextualEntry({
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence,
      lemma,
    });
  }

  /**
   * Write an image-generation prompt for a word's meaning
   */
  public async generateImagePrompt(params: {
    headword: string;
    definition: string;
    exampleSentence?: string;
    style: ImageStyle;
  }): Promise<string | null> {
    return this.provider.generateImagePrompt(params);
  }

  /**
   * Test connection with current provider
   */
  public async testConnection() {
    return this.provider.testConnection();
  }
}

export default AIManager;
