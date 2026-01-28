import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  ModelProvider,
  ProviderConfig,
  ProviderTestResult,
} from './ModelProvider';
import { DictionaryEntry, LemmaResponse } from '@/lib/types';
import DatabaseManager from '@/lib/database';

/**
 * ChatGPT (OpenAI) Provider
 */
export class ChatGPTProvider implements ModelProvider {
  private client: OpenAI;
  private db: DatabaseManager;
  private model: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.model = config.model || 'gpt-4-turbo';
    this.db = DatabaseManager.getInstance();
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const tokenParam = this.getTokenLimitParam(10);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        ...tokenParam,
      });

      if (response.choices && response.choices.length > 0) {
        return {
          success: true,
          message: 'Connection successful',
        };
      }

      return {
        success: false,
        error: 'No response from API',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null> {
    try {
      const langDirection = await this.detectLanguageDirection(
        params.word,
        params.sourceLanguage,
        params.targetLanguage
      );

      const prompt = await this.loadPrompt('prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const tokenParam = this.getTokenLimitParam(2000);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a dictionary entry creator. Generate accurate, educational dictionary entries in the exact JSON format specified.',
          },
          {
            role: 'user',
            content: processedPrompt + '\n\n' + params.word,
          },
        ],
        temperature: 0.7,
        ...tokenParam,
      });

      const entry = this.parseEntryResponse(response.choices[0]?.message?.content);
      if (entry) {
        entry.metadata = {
          source_language: params.sourceLanguage,
          target_language: params.targetLanguage,
          definition_language: langDirection.definitionLang,
        };
      }

      return entry;
    } catch (error) {
      console.error('ChatGPT: Error generating entry:', error);
      return null;
    }
  }

  async regenerateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null> {
    try {
      const langDirection = await this.detectLanguageDirection(
        params.word,
        params.sourceLanguage,
        params.targetLanguage
      );

      const prompt = await this.loadPrompt('prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const currentTime = new Date().toISOString();
      const variationSeed = Math.floor(Math.random() * 10000);

      const tokenParam = this.getTokenLimitParam(2000);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a dictionary entry creator focused on accuracy and educational value.',
          },
          {
            role: 'system',
            content: `Create a dictionary entry for '${params.word}' that is linguistically accurate.`,
          },
          {
            role: 'system',
            content: `Current time: ${currentTime}. Session ID: ${variationSeed}`,
          },
          {
            role: 'user',
            content: processedPrompt + '\n\n' + params.word,
          },
        ],
        temperature: 0.8,
        ...tokenParam,
      });

      const entry = this.parseEntryResponse(response.choices[0]?.message?.content);
      if (entry) {
        entry.metadata = {
          source_language: params.sourceLanguage,
          target_language: params.targetLanguage,
          definition_language: langDirection.definitionLang,
        };
      }

      return entry;
    } catch (error) {
      console.error('ChatGPT: Error regenerating entry:', error);
      return null;
    }
  }

  async getLemma(params: {
    word: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    const cachedLemma = await this.db.getCachedLemma(params.word, params.targetLanguage);
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt('lemma_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: params.word,
        TARGET_LANGUAGE: params.targetLanguage,
        SOURCE_LANGUAGE: 'English',
      });

      const tokenParam = this.getTokenLimitParam(100);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a lemmatization function. Return only the lemma form, no additional text.',
          },
          {
            role: 'user',
            content: processedPrompt,
          },
        ],
        temperature: 0.3,
        ...tokenParam,
      });

      const lemma = this.cleanLemma(response.choices[0]?.message?.content?.trim() || params.word);
      await this.db.cacheLemma(params.word, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error('ChatGPT: Error getting lemma:', error);
      return { lemma: params.word, cached: false };
    }
  }

  async getLemmaWithContext(params: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    const cacheKey = `${params.word}|${params.contextSentence.substring(0, 50)}`;
    const cachedLemma = await this.db.getCachedLemma(cacheKey, params.targetLanguage);
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt('lemma_context_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: params.word,
        SENTENCE_CONTEXT: params.contextSentence,
        TARGET_LANGUAGE: params.targetLanguage,
      });

      const tokenParam = this.getTokenLimitParam(100);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a lemmatization function that uses sentence context to find the correct dictionary headword.',
          },
          {
            role: 'user',
            content: processedPrompt,
          },
        ],
        temperature: 0.3,
        ...tokenParam,
      });

      const lemma = this.cleanLemma(response.choices[0]?.message?.content?.trim() || params.word);
      await this.db.cacheLemma(cacheKey, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error('ChatGPT: Error getting contextual lemma:', error);
      return { lemma: params.word, cached: false };
    }
  }

  async generateContextualEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
    contextSentence: string;
  }): Promise<DictionaryEntry | null> {
    try {
      const { lemma } = await this.getLemmaWithContext({
        word: params.word,
        contextSentence: params.contextSentence,
        targetLanguage: params.targetLanguage,
      });

      const langDirection = await this.detectLanguageDirection(
        lemma,
        params.sourceLanguage,
        params.targetLanguage
      );

      const prompt = await this.loadPrompt('prompt_with_context.txt');
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
        TARGET_WORD: params.word,
        SENTENCE_CONTEXT: params.contextSentence,
      });

      const tokenParam = this.getTokenLimitParam(2000);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a context-aware dictionary entry creator. Include the context sentence as one of the examples.',
          },
          {
            role: 'user',
            content: processedPrompt + '\n\n' + lemma,
          },
        ],
        temperature: 0.7,
        ...tokenParam,
      });

      const entry = this.parseEntryResponse(response.choices[0]?.message?.content);
      if (entry) {
        entry.metadata = {
          source_language: params.sourceLanguage,
          target_language: params.targetLanguage,
          definition_language: langDirection.definitionLang,
          has_context: true,
          context_sentence: params.contextSentence,
        };
      }

      return entry;
    } catch (error) {
      console.error('ChatGPT: Error generating contextual entry:', error);
      return null;
    }
  }

  async validateLanguage(languageName: string): Promise<{
    standardizedName: string;
    displayName: string;
  }> {
    try {
      const prompt = await this.loadPrompt('language_validation_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        INPUT_LANGUAGE: languageName,
      });

      const tokenParam = this.getTokenLimitParam(200);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a language identification assistant. Return only valid JSON.',
          },
          {
            role: 'user',
            content: processedPrompt,
          },
        ],
        temperature: 0.3,
        ...tokenParam,
      });

      const result = JSON.parse(response.choices[0]?.message?.content?.trim() || '{}');
      return {
        standardizedName: result.standardized_name || languageName,
        displayName: result.display_name || languageName,
      };
    } catch (error) {
      console.error('ChatGPT: Error validating language:', error);
      return {
        standardizedName: languageName,
        displayName: languageName,
      };
    }
  }

  /**
   * Get the appropriate token limit parameter based on model
   * Newer models (GPT-5+, O3) require max_completion_tokens instead of max_tokens
   */
  private getTokenLimitParam(limit: number): { max_tokens: number } | { max_completion_tokens: number } {
    const newModels = ['gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3-pro', 'o3'];
    const isNewModel = newModels.some(model => this.model.includes(model));
    
    if (isNewModel) {
      return { max_completion_tokens: limit };
    }
    return { max_tokens: limit };
  }

  // Helper methods (same as DeepSeek)
  private async detectLanguageDirection(
    word: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{
    actualSourceLang: string;
    actualTargetLang: string;
    definitionLang: string;
    needsTranslation: boolean;
  }> {
    const hasLatinScript = /^[a-zA-Z\s\-']+$/.test(word);
    const hasCzechDiacritics = /[áčďéěíňóřšťúůýž]/i.test(word);
    const hasGermanDiacritics = /[äöüß]/i.test(word);
    const hasSpanishDiacritics = /[ñáéíóúü]/i.test(word);

    let detectedSourceLang = sourceLanguage;
    let detectedTargetLang = targetLanguage;
    let detectedDefinitionLang = sourceLanguage;

    if (targetLanguage.toLowerCase() === 'czech' && hasCzechDiacritics) {
      detectedSourceLang = targetLanguage;
      detectedTargetLang = targetLanguage;
      detectedDefinitionLang = sourceLanguage;
    } else if (targetLanguage.toLowerCase() === 'german' && hasGermanDiacritics) {
      detectedSourceLang = targetLanguage;
      detectedTargetLang = targetLanguage;
      detectedDefinitionLang = sourceLanguage;
    } else if (targetLanguage.toLowerCase() === 'spanish' && hasSpanishDiacritics) {
      detectedSourceLang = targetLanguage;
      detectedTargetLang = targetLanguage;
      detectedDefinitionLang = sourceLanguage;
    }

    return {
      actualSourceLang: detectedSourceLang,
      actualTargetLang: detectedTargetLang,
      definitionLang: detectedDefinitionLang,
      needsTranslation: detectedSourceLang !== detectedTargetLang,
    };
  }

  private async loadPrompt(filename: string): Promise<string> {
    const promptPath = path.join(process.cwd(), 'data', 'prompts', filename);
    return await readFile(promptPath, 'utf-8');
  }

  private processPrompt(prompt: string, variables: Record<string, string>): string {
    let processedPrompt = prompt;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `[${key}]`;
      processedPrompt = processedPrompt.split(placeholder).join(value);
    });
    return processedPrompt;
  }

  private parseEntryResponse(content: string | null | undefined): DictionaryEntry | null {
    if (!content) return null;

    try {
      const cleanedContent = content
        .replace(/^\s*```(json)?\s*$/gm, '')
        .replace(/```\s*$/gm, '')
        .trim();

      const entry = JSON.parse(cleanedContent) as DictionaryEntry;

      if (!entry.headword || !entry.meanings || !Array.isArray(entry.meanings)) {
        return null;
      }

      return entry;
    } catch (error) {
      console.error('Failed to parse entry response:', error);
      return null;
    }
  }

  private cleanLemma(lemma: string): string {
    let cleaned = lemma;

    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }

    cleaned = cleaned.replace(/^[\s.,;:!?()]+|[\s.,;:!?()]+$/g, '').trim();

    return cleaned || lemma;
  }
}
