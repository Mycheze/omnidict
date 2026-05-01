import { readFile } from "fs/promises";
import path from "path";
import { ModelProvider, ProviderTestResult } from "./ModelProvider";
import { DictionaryEntry, LemmaResponse } from "@/lib/types";
import DatabaseManager from "@/lib/database";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export abstract class BaseProvider implements ModelProvider {
  protected db: DatabaseManager;
  protected providerName: string;

  constructor(providerName: string) {
    this.db = DatabaseManager.getInstance();
    this.providerName = providerName;
  }

  protected abstract callApi(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number },
  ): Promise<string>;

  abstract testConnection(): Promise<ProviderTestResult>;

  async generateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null> {
    try {
      const langDirection = this.detectLanguageDirection(
        params.word,
        params.sourceLanguage,
        params.targetLanguage,
      );

      const prompt = await this.loadPrompt("prompt.txt");
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a dictionary entry creator. Generate accurate, educational dictionary entries in the exact JSON format specified.",
          },
          {
            role: "user",
            content: processedPrompt + "\n\n" + params.word,
          },
        ],
        { temperature: 0.7, maxTokens: 2000 },
      );

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
      console.error(`${this.providerName}: Error generating entry:`, error);
      return null;
    }
  }

  async regenerateEntry(params: {
    word: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<DictionaryEntry | null> {
    try {
      const langDirection = this.detectLanguageDirection(
        params.word,
        params.sourceLanguage,
        params.targetLanguage,
      );

      const prompt = await this.loadPrompt("prompt.txt");
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const currentTime = new Date().toISOString();
      const variationSeed = Math.floor(Math.random() * 10000);

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a dictionary entry creator focused on accuracy and educational value.",
          },
          {
            role: "system",
            content: `Create a dictionary entry for '${params.word}' that is linguistically accurate.`,
          },
          {
            role: "system",
            content: `Current time: ${currentTime}. Session ID: ${variationSeed}`,
          },
          {
            role: "user",
            content: processedPrompt + "\n\n" + params.word,
          },
        ],
        { temperature: 0.8, maxTokens: 2000 },
      );

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
      console.error(`${this.providerName}: Error regenerating entry:`, error);
      return null;
    }
  }

  async getLemma(params: {
    word: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    const cachedLemma = await this.db.getCachedLemma(
      params.word,
      params.targetLanguage,
    );
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt("lemma_prompt.txt");
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: params.word,
        TARGET_LANGUAGE: params.targetLanguage,
        SOURCE_LANGUAGE: "English",
      });

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a lemmatization function. Return only the lemma form, no additional text.",
          },
          {
            role: "user",
            content: processedPrompt,
          },
        ],
        { temperature: 0.3, maxTokens: 100 },
      );

      const lemma = this.cleanLemma(text.trim());
      await this.db.cacheLemma(params.word, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error(`${this.providerName}: Error getting lemma:`, error);
      return { lemma: params.word, cached: false };
    }
  }

  async getLemmaWithContext(params: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    const cacheKey = `${params.word}|${params.contextSentence.substring(0, 50)}`;
    const cachedLemma = await this.db.getCachedLemma(
      cacheKey,
      params.targetLanguage,
    );
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt("lemma_context_prompt.txt");
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: params.word,
        SENTENCE_CONTEXT: params.contextSentence,
        TARGET_LANGUAGE: params.targetLanguage,
      });

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a lemmatization function that uses sentence context to find the correct dictionary headword.",
          },
          {
            role: "user",
            content: processedPrompt,
          },
        ],
        { temperature: 0.3, maxTokens: 100 },
      );

      const lemma = this.cleanLemma(text.trim());
      await this.db.cacheLemma(cacheKey, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error(
        `${this.providerName}: Error getting contextual lemma:`,
        error,
      );
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

      const langDirection = this.detectLanguageDirection(
        lemma,
        params.sourceLanguage,
        params.targetLanguage,
      );

      const prompt = await this.loadPrompt("prompt_with_context.txt");
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
        TARGET_WORD: params.word,
        SENTENCE_CONTEXT: params.contextSentence,
      });

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a context-aware dictionary entry creator. Include the context sentence as one of the examples.",
          },
          {
            role: "user",
            content: processedPrompt + "\n\n" + lemma,
          },
        ],
        { temperature: 0.7, maxTokens: 2000 },
      );

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
      console.error(
        `${this.providerName}: Error generating contextual entry:`,
        error,
      );
      return null;
    }
  }

  async validateLanguage(languageName: string): Promise<{
    standardizedName: string;
    displayName: string;
  }> {
    try {
      const prompt = await this.loadPrompt("language_validation_prompt.txt");
      const processedPrompt = this.processPrompt(prompt, {
        INPUT_LANGUAGE: languageName,
      });

      const text = await this.callApi(
        [
          {
            role: "system",
            content:
              "You are a language identification assistant. Return only valid JSON.",
          },
          {
            role: "user",
            content: processedPrompt,
          },
        ],
        { temperature: 0.3, maxTokens: 200 },
      );

      const result = JSON.parse(text.trim());
      return {
        standardizedName: result.standardized_name || languageName,
        displayName: result.display_name || languageName,
      };
    } catch (error) {
      console.error(`${this.providerName}: Error validating language:`, error);
      return {
        standardizedName: languageName,
        displayName: languageName,
      };
    }
  }

  protected detectLanguageDirection(
    word: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): {
    actualSourceLang: string;
    actualTargetLang: string;
    definitionLang: string;
    needsTranslation: boolean;
  } {
    const hasCzechDiacritics = /[áčďéěíňóřšťúůýž]/i.test(word);
    const hasGermanDiacritics = /[äöüß]/i.test(word);
    const hasSpanishDiacritics = /[ñáéíóúü]/i.test(word);

    let detectedSourceLang = sourceLanguage;
    let detectedTargetLang = targetLanguage;
    let detectedDefinitionLang = sourceLanguage;

    if (targetLanguage.toLowerCase() === "czech" && hasCzechDiacritics) {
      detectedSourceLang = targetLanguage;
      detectedTargetLang = targetLanguage;
      detectedDefinitionLang = sourceLanguage;
    } else if (
      targetLanguage.toLowerCase() === "german" &&
      hasGermanDiacritics
    ) {
      detectedSourceLang = targetLanguage;
      detectedTargetLang = targetLanguage;
      detectedDefinitionLang = sourceLanguage;
    } else if (
      targetLanguage.toLowerCase() === "spanish" &&
      hasSpanishDiacritics
    ) {
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

  protected async loadPrompt(filename: string): Promise<string> {
    const promptPath = path.join(process.cwd(), "data", "prompts", filename);
    return await readFile(promptPath, "utf-8");
  }

  protected processPrompt(
    prompt: string,
    variables: Record<string, string>,
  ): string {
    let processedPrompt = prompt;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `[${key}]`;
      processedPrompt = processedPrompt.split(placeholder).join(value);
    });
    return processedPrompt;
  }

  protected parseEntryResponse(
    content: string | null | undefined,
  ): DictionaryEntry | null {
    if (!content) return null;

    try {
      const cleanedContent = content
        .replace(/^\s*```(json)?\s*$/gm, "")
        .replace(/```\s*$/gm, "")
        .trim();

      const entry = JSON.parse(cleanedContent) as DictionaryEntry;

      if (
        !entry.headword ||
        !entry.meanings ||
        !Array.isArray(entry.meanings)
      ) {
        return null;
      }

      return entry;
    } catch (error) {
      console.error("Failed to parse entry response:", error);
      return null;
    }
  }

  protected cleanLemma(lemma: string): string {
    let cleaned = lemma;

    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }

    cleaned = cleaned.replace(/^[\s.,;:!?()]+|[\s.,;:!?()]+$/g, "").trim();

    return cleaned || lemma;
  }
}
