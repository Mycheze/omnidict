import {
  DictionaryEntry,
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
  private static config: AIManagerConfig | null = null;

  constructor(config?: AIManagerConfig) {
    const finalConfig = config || AIManager.config || {};

    // Default to DeepSeek with environment variable
    const providerType: AIProviderType = finalConfig.providerType || "deepseek";

    const providerConfig: ProviderConfig | undefined =
      providerType === "deepseek" && !finalConfig.apiKey
        ? undefined // DeepSeek will use env variable
        : {
            apiKey: finalConfig.apiKey || "",
            model: finalConfig.model || "",
          };

    this.provider = createProvider(providerType, providerConfig);
  }

  /**
   * Configure the default AIManager instance
   */
  public static configure(config: AIManagerConfig): void {
    AIManager.config = config;
    AIManager.instance = null; // Force recreation on next getInstance()
  }

  /**
   * Get singleton instance of AIManager
   */
  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager(AIManager.config || undefined);
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
  }: LemmaRequest): Promise<LemmaResponse> {
    return this.provider.getLemma({ word, targetLanguage });
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
  }: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    return this.provider.getLemmaWithContext({
      word,
      contextSentence,
      targetLanguage,
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
  }: ContextualEntryGenerationRequest): Promise<DictionaryEntry | null> {
    return this.provider.generateContextualEntry({
      word,
      sourceLanguage,
      targetLanguage,
      contextSentence,
    });
  }

  /**
   * Validate a language name
   */
  public async validateLanguage(languageName: string): Promise<{
    standardizedName: string;
    displayName: string;
  }> {
    return this.provider.validateLanguage(languageName);
  }

  /**
   * Test connection with current provider
   */
  public async testConnection() {
    return this.provider.testConnection();
  }
}

export default AIManager;
