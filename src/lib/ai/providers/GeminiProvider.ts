import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Gemini (Google) Provider
 */
export class GeminiProvider implements ModelProvider {
  private client: GoogleGenerativeAI;
  private db: DatabaseManager;
  private modelName: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Google API key is required');
    }

    this.client = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || 'gemini-2.5-flash';
    this.db = DatabaseManager.getInstance();
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent('ping');
      const response = await result.response;
      const text = response.text();

      if (text) {
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

      const fullPrompt = `You are a dictionary entry creator. Generate accurate, educational dictionary entries in the exact JSON format specified.\n\n${processedPrompt}\n\n${params.word}`;

      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const entry = this.parseEntryResponse(text);
      if (entry) {
        entry.metadata = {
          source_language: params.sourceLanguage,
          target_language: params.targetLanguage,
          definition_language: langDirection.definitionLang,
        };
      }

      return entry;
    } catch (error) {
      console.error('Gemini: Error generating entry:', error);
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

      const fullPrompt = `You are a dictionary entry creator focused on accuracy and educational value. Create a dictionary entry for '${params.word}' that is linguistically accurate. Current time: ${currentTime}. Session ID: ${variationSeed}\n\n${processedPrompt}\n\n${params.word}`;

      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.8,
        },
      });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const entry = this.parseEntryResponse(text);
      if (entry) {
        entry.metadata = {
          source_language: params.sourceLanguage,
          target_language: params.targetLanguage,
          definition_language: langDirection.definitionLang,
        };
      }

      return entry;
    } catch (error) {
      console.error('Gemini: Error regenerating entry:', error);
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

      const fullPrompt = `You are a lemmatization function. Return only the lemma form, no additional text.\n\n${processedPrompt}`;

      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 100,
        },
      });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const lemma = this.cleanLemma(text.trim());
      await this.db.cacheLemma(params.word, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error('Gemini: Error getting lemma:', error);
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

      const fullPrompt = `You are a lemmatization function that uses sentence context to find the correct dictionary headword.\n\n${processedPrompt}`;

      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 100,
        },
      });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const lemma = this.cleanLemma(text.trim());
      await this.db.cacheLemma(cacheKey, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error('Gemini: Error getting contextual lemma:', error);
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

      const fullPrompt = `You are a context-aware dictionary entry creator. Include the context sentence as one of the examples.\n\n${processedPrompt}\n\n${lemma}`;

      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const entry = this.parseEntryResponse(text);
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
      console.error('Gemini: Error generating contextual entry:', error);
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

      const fullPrompt = `You are a language identification assistant. Return only valid JSON.\n\n${processedPrompt}`;

      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
        },
      });
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const cleanedText = text.replace(/^```(json)?\s*$/gm, '').replace(/```\s*$/gm, '').trim();
      const resultData = JSON.parse(cleanedText);

      return {
        standardizedName: resultData.standardized_name || languageName,
        displayName: resultData.display_name || languageName,
      };
    } catch (error) {
      console.error('Gemini: Error validating language:', error);
      return {
        standardizedName: languageName,
        displayName: languageName,
      };
    }
  }

  // Helper methods
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
