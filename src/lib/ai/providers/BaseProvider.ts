import { readFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { ModelProvider, ProviderTestResult } from "./ModelProvider";
import { DictionaryEntry, ImageStyle, LemmaResponse } from "@/lib/types";
import { IMAGE_STYLES } from "@/lib/media/imageStyles";
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
    options: { temperature?: number; maxTokens?: number; thinking?: boolean },
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
        // maxTokens must cover reasoning tokens when thinking is enabled
        { temperature: 0.3, maxTokens: 1000, thinking: true },
      );

      const lemma = this.cleanLemma(text.trim());
      if (!this.isValidLemma(lemma)) {
        console.error(
          `${this.providerName}: Invalid lemma response for "${params.word}": ${JSON.stringify(text)}`,
        );
        return { lemma: params.word, cached: false, fallback: true };
      }
      await this.db.cacheLemma(params.word, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error(`${this.providerName}: Error getting lemma:`, error);
      return { lemma: params.word, cached: false, fallback: true };
    }
  }

  async getLemmaWithContext(params: {
    word: string;
    contextSentence: string;
    targetLanguage: string;
  }): Promise<LemmaResponse> {
    const contextHash = createHash("sha256")
      .update(params.contextSentence)
      .digest("hex")
      .substring(0, 16);
    const cacheKey = `${params.word}|ctx:${contextHash}`;
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
        // maxTokens must cover reasoning tokens when thinking is enabled
        { temperature: 0.3, maxTokens: 1000, thinking: true },
      );

      const lemma = this.cleanLemma(text.trim());
      if (!this.isValidLemma(lemma)) {
        console.error(
          `${this.providerName}: Invalid contextual lemma response for "${params.word}": ${JSON.stringify(text)}`,
        );
        return { lemma: params.word, cached: false, fallback: true };
      }
      await this.db.cacheLemma(cacheKey, lemma, params.targetLanguage);

      return { lemma, cached: false };
    } catch (error) {
      console.error(
        `${this.providerName}: Error getting contextual lemma:`,
        error,
      );
      return { lemma: params.word, cached: false, fallback: true };
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

  /**
   * Write an image-generation prompt that illustrates a word's meaning.
   * Fail-loud: returns null rather than a generic prompt so callers skip
   * the render instead of producing a garbage image. Reasoning models burn
   * output tokens on thinking, so the budget escalates across attempts.
   */
  async generateImagePrompt(params: {
    headword: string;
    definition: string;
    exampleSentence?: string;
    style: ImageStyle;
  }): Promise<string | null> {
    const styleConfig = IMAGE_STYLES[params.style];
    const minPromptLength = 40;

    const userMessage = `Word meaning: ${params.definition}
${params.exampleSentence ? `Context sentence: ${params.exampleSentence}\n` : ""}
Classify the meaning (concrete object / action / abstract state) and write an image prompt that makes a learner instantly recognize the concept.

If it is a CONCRETE OBJECT, depict that real ordinary object clearly and literally (name it plainly in the prompt) — keep its true shape and function; do not embellish it into something fancier or magical.
If it is an ACTION, show one subject clearly performing it.
If it is ABSTRACT, show ONE ordinary, realistic HUMAN's plain expression/posture (or one obvious literal metaphor) conveying the state — no multi-element symbolic puzzles, and ABSOLUTELY NO animals, animal-headed/anthropomorphic characters, or puns on the English wording (illustrate the real meaning, never a wordplay).

Do NOT render the word "${params.headword}" or any text in the image.`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await this.callApi(
          [
            { role: "system", content: styleConfig.systemPrompt },
            { role: "user", content: userMessage },
          ],
          {
            temperature: 0.6 + attempt * 0.1,
            maxTokens: 1000 + attempt * 800,
            thinking: true,
          },
        );

        let prompt = text.trim();
        if (!prompt || prompt.length < minPromptLength) {
          console.warn(
            `${this.providerName}: Bad image prompt for "${params.headword}" (len=${prompt.length}), retrying`,
          );
          continue;
        }

        const textLeakWords = [
          "text",
          "word",
          "letter",
          "writing",
          "caption",
          "label",
          "inscription",
        ];
        if (textLeakWords.some((w) => prompt.toLowerCase().includes(w))) {
          prompt += " No text or writing visible.";
        }
        return prompt;
      } catch (error) {
        console.error(
          `${this.providerName}: Image prompt attempt ${attempt + 1} failed:`,
          error,
        );
      }
    }

    console.error(
      `${this.providerName}: Image prompt FAILED after 3 attempts for "${params.headword}" — render will be skipped`,
    );
    return null;
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

    return cleaned;
  }

  protected isValidLemma(lemma: string): boolean {
    if (!lemma) return false;
    if (lemma.includes("\n")) return false;
    if (lemma.length > 100) return false;
    // MWEs and idioms are legitimate; explanations/refusals are not
    if (lemma.split(/\s+/).length > 8) return false;
    return true;
  }
}
