import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import path from 'path';
import { DictionaryEntry, LemmaRequest, LemmaResponse, ContextualEntryGenerationRequest } from '@/lib/types';
import DatabaseManager from '@/lib/database';

// Simplified interface for entry generation
interface SimplifiedEntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
}

class AIManager {
  private client: OpenAI;
  private db: DatabaseManager;
  private static instance: AIManager;

  constructor() {
    // Validate environment variables
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.deepseek.com"
    });
    
    this.db = DatabaseManager.getInstance();
  }

  /**
   * Detect the likely language of a word and determine optimal processing direction
   * IMPORTANT: Target language should NEVER change - it's the language the user is learning!
   */
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
    // Basic heuristics for language detection
    const hasLatinScript = /^[a-zA-Z\s\-']+$/.test(word);
    const hasCyrillicScript = /[\u0400-\u04FF]/.test(word);
    const hasCzechDiacritics = /[áčďéěíňóřšťúůýž]/i.test(word);
    const hasGermanDiacritics = /[äöüß]/i.test(word);
    const hasSpanishDiacritics = /[ñáéíóúü]/i.test(word);
    
    // Language-specific word patterns
    const czechPatterns = /\b(a|je|to|na|se|v|o|za|do|od|po|při|před|nad|pod|mezi|přes|podle|kolem|během|díky|kvůli)\b/i;
    const englishPatterns = /\b(the|and|or|but|in|on|at|to|for|of|with|by|from|about|into|through|during|before|after|above|below|up|down|out|off|over|under|again|further|then|once)\b/i;
    
    // THE KEY FIX: Target language never changes - it's always the language the user is learning
    let detectedSourceLang = sourceLanguage;
    let detectedTargetLang = targetLanguage; // ALWAYS keep the user's target language
    let detectedDefinitionLang = sourceLanguage; // Definitions in user's native language
    
    // Detect if word is likely in target language already
    if (targetLanguage.toLowerCase() === 'czech' && (hasCzechDiacritics || czechPatterns.test(word))) {
      // Word is already in Czech, but user is STILL learning Czech
      detectedSourceLang = targetLanguage; // Czech (word origin)
      detectedTargetLang = targetLanguage; // Czech (STILL the learning language)
      detectedDefinitionLang = sourceLanguage; // English (explain in native language)
    } else if (targetLanguage.toLowerCase() === 'german' && hasGermanDiacritics) {
      detectedSourceLang = targetLanguage; // German (word origin)
      detectedTargetLang = targetLanguage; // German (STILL the learning language)
      detectedDefinitionLang = sourceLanguage; // Explain in native language
    } else if (targetLanguage.toLowerCase() === 'spanish' && hasSpanishDiacritics) {
      detectedSourceLang = targetLanguage; // Spanish (word origin)
      detectedTargetLang = targetLanguage; // Spanish (STILL the learning language)
      detectedDefinitionLang = sourceLanguage; // Explain in native language
    } else if (sourceLanguage.toLowerCase() === 'english' && englishPatterns.test(word) && hasLatinScript && !hasCzechDiacritics) {
      // Word is likely English, normal direction
      detectedSourceLang = sourceLanguage; // English
      detectedTargetLang = targetLanguage; // Czech (learning language)
      detectedDefinitionLang = sourceLanguage; // English
    }
    
    // Special case: Same language dictionary (e.g., Czech → Czech)
    if (sourceLanguage === targetLanguage) {
      if (hasLatinScript && !hasCzechDiacritics && englishPatterns.test(word)) {
        // English word in Czech→Czech dictionary
        detectedSourceLang = 'English';
        detectedTargetLang = sourceLanguage; // Czech
        detectedDefinitionLang = sourceLanguage; // Czech
      } else {
        // Native word in same-language dictionary
        detectedSourceLang = sourceLanguage;
        detectedTargetLang = targetLanguage;
        detectedDefinitionLang = sourceLanguage;
      }
    }
    
    console.log(`Language detection for "${word}":`);
    console.log(`  User setting: ${sourceLanguage} → ${targetLanguage}`);
    console.log(`  Word source: ${detectedSourceLang}`);
    console.log(`  Learning language (target): ${detectedTargetLang}`);
    console.log(`  Definition language: ${detectedDefinitionLang}`);
    console.log(`  → Examples will be in: ${detectedTargetLang}`);
    console.log(`  → Definitions will be in: ${detectedDefinitionLang}`);
    
    return {
      actualSourceLang: detectedSourceLang,
      actualTargetLang: detectedTargetLang,
      definitionLang: detectedDefinitionLang,
      needsTranslation: detectedSourceLang !== detectedTargetLang
    };
  }

  /**
   * Get singleton instance of AIManager
   */
  public static getInstance(): AIManager {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager();
    }
    return AIManager.instance;
  }

  /**
   * Get lemma form of a word
   */
  public async getLemma({ word, targetLanguage }: LemmaRequest): Promise<LemmaResponse> {
    // Check cache first
    const cachedLemma = this.db.getCachedLemma(word, targetLanguage);
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt('lemma_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: word,
        TARGET_LANGUAGE: targetLanguage,
        SOURCE_LANGUAGE: 'English', // Default for now
      });

      console.log('Getting lemma for:', word, 'in', targetLanguage);

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a lemmatization function inside a dictionary that must preserve multi-word expressions. Return only the lemma form, no additional text."
          },
          {
            role: "user",
            content: processedPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      const lemma = response.choices[0]?.message?.content?.trim() || word;
          
      console.log('🔍 LEMMA DEBUG:');
      console.log('  Input word:', JSON.stringify(word));
      console.log('  AI raw response:', JSON.stringify(lemma));
      console.log('  AI response length:', lemma.length);
          
      // Clean the lemma - be very conservative to preserve Unicode characters
      let cleanedLemma = lemma;
          
      // Remove surrounding quotes only
      if ((cleanedLemma.startsWith('"') && cleanedLemma.endsWith('"')) ||
          (cleanedLemma.startsWith("'") && cleanedLemma.endsWith("'"))) {
        console.log('  Removing quotes from:', JSON.stringify(cleanedLemma));
        cleanedLemma = cleanedLemma.slice(1, -1);
        console.log('  After quote removal:', JSON.stringify(cleanedLemma));
      }
      
      // Only remove leading/trailing spaces and basic punctuation, preserve all letters including Unicode
      const beforePunctuation = cleanedLemma;
      cleanedLemma = cleanedLemma.replace(/^[\s.,;:!?()]+|[\s.,;:!?()]+$/g, '').trim();
      if (beforePunctuation !== cleanedLemma) {
        console.log('  After punctuation removal:', JSON.stringify(cleanedLemma));
      }
      
      // Fallback to original word if cleaning resulted in empty string
      if (!cleanedLemma || cleanedLemma.length === 0) {
        console.log('  Using fallback to original word');
        cleanedLemma = word;
      }
      
      console.log('  Final cleaned lemma:', JSON.stringify(cleanedLemma));
      console.log('  Character codes:', cleanedLemma.split('').map(c => `${c}:${c.charCodeAt(0)}`).join(' '));

      // Cache the result
      this.db.cacheLemma(word, cleanedLemma, targetLanguage);

      console.log('Lemma result:', word, '→', cleanedLemma);

      return { lemma: cleanedLemma, cached: false };
    } catch (error) {
      console.error('Error getting lemma:', error);
      return { lemma: word, cached: false };
    }
  }

  /**
   * Generate a new dictionary entry with intelligent language direction detection
   */
  public async generateEntry({
    word,
    sourceLanguage,
    targetLanguage
  }: SimplifiedEntryGenerationRequest): Promise<DictionaryEntry | null> {
    try {
      console.log('Generating entry for:', word, `(${sourceLanguage} → ${targetLanguage})`);

      // Detect optimal language direction
      const langDirection = await this.detectLanguageDirection(word, sourceLanguage, targetLanguage);

      const prompt = await this.loadPrompt('prompt.txt');
      
      // Use detected language directions
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a dictionary entry creator. Generate accurate, educational dictionary entries in the exact JSON format specified. Focus on practical, everyday usage. Handle bidirectional lookups intelligently."
          },
          {
            role: "user",
            content: processedPrompt + '\n\n' + word
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from AI');
      }

      console.log('AI Response received, parsing JSON...');

      // Clean JSON content (remove code blocks)
      const cleanedContent = responseContent
        .replace(/^\s*```(json)?\s*$/gm, '')
        .replace(/```\s*$/gm, '')
        .trim();

      try {
        const entry = JSON.parse(cleanedContent) as DictionaryEntry;
        
        // Validate the entry structure
        if (!entry.headword || !entry.meanings || !Array.isArray(entry.meanings)) {
          console.error('Invalid entry structure:', entry);
          throw new Error('Invalid entry structure');
        }

        // Ensure metadata reflects the USER'S original language settings for storage/filtering
        entry.metadata = {
          source_language: sourceLanguage,
          target_language: targetLanguage,
          definition_language: langDirection.definitionLang,
        };

        console.log('Entry generated successfully:', entry.headword);
        console.log('Part of speech:', entry.part_of_speech);
        return entry;

      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
        console.error('Raw response:', responseContent);
        console.error('Cleaned content:', cleanedContent);
        return null;
      }
    } catch (error) {
      console.error('Error generating entry:', error);
      return null;
    }
  }

  /**
   * Regenerate an existing entry with variation and intelligent language detection
   */
  public async regenerateEntry({
    word,
    sourceLanguage,
    targetLanguage
  }: SimplifiedEntryGenerationRequest): Promise<DictionaryEntry | null> {
    try {
      console.log('Regenerating entry for:', word, `(${sourceLanguage} → ${targetLanguage})`);

      // Detect optimal language direction
      const langDirection = await this.detectLanguageDirection(word, sourceLanguage, targetLanguage);

      const prompt = await this.loadPrompt('prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
      });

      const currentTime = new Date().toISOString();
      const variationSeed = Math.floor(Math.random() * 10000);

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a dictionary entry creator focused on accuracy and educational value. Create slightly different but equally accurate dictionary entries."
          },
          {
            role: "system",
            content: `Create a dictionary entry for '${word}' that is linguistically accurate and pedagogically sound.`
          },
          {
            role: "system",
            content: `Current time: ${currentTime}. Session ID: ${variationSeed}`
          },
          {
            role: "system",
            content: "Provide slightly different phrasings and examples while maintaining complete accuracy of meaning and usage."
          },
          {
            role: "user",
            content: processedPrompt + '\n\n' + word
          }
        ],
        temperature: 0.8, // Higher temperature for more variation
        max_tokens: 2000,
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from AI');
      }

      // Clean JSON content
      const cleanedContent = responseContent
        .replace(/^\s*```(json)?\s*$/gm, '')
        .replace(/```\s*$/gm, '')
        .trim();

      try {
        const entry = JSON.parse(cleanedContent) as DictionaryEntry;
        
        if (!entry.headword || !entry.meanings || !Array.isArray(entry.meanings)) {
          console.error('Invalid entry structure:', entry);
          throw new Error('Invalid entry structure');
        }

        // Ensure metadata reflects the USER'S original language settings
        entry.metadata = {
          source_language: sourceLanguage,
          target_language: targetLanguage,
          definition_language: langDirection.definitionLang,
        };

        console.log('Entry regenerated successfully:', entry.headword);
        return entry;

      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError);
        console.error('Raw response:', responseContent);
        return null;
      }
    } catch (error) {
      console.error('Error regenerating entry:', error);
      return null;
    }
  }

  /**
   * Get lemma form of a word with context
   */
  public async getLemmaWithContext({ 
    word, 
    contextSentence, 
    targetLanguage 
  }: { 
    word: string; 
    contextSentence: string; 
    targetLanguage: string; 
  }): Promise<LemmaResponse> {
    // Check cache first (context-aware cache key)
    const cacheKey = `${word}|${contextSentence.substring(0, 50)}`;
    const cachedLemma = this.db.getCachedLemma(cacheKey, targetLanguage);
    if (cachedLemma) {
      return { lemma: cachedLemma, cached: true };
    }

    try {
      const prompt = await this.loadPrompt('lemma_context_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        TARGET_WORD: word,
        SENTENCE_CONTEXT: contextSentence,
        TARGET_LANGUAGE: targetLanguage,
      });

      console.log('Getting contextual lemma for:', word, 'in sentence:', contextSentence);

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a lemmatization function that uses sentence context to find the correct dictionary headword. Consider multi-word expressions and context clues."
          },
          {
            role: "user",
            content: processedPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
      });

      const lemma = response.choices[0]?.message?.content?.trim() || word;
      
      // Clean the lemma
      let cleanedLemma = lemma;
      if ((cleanedLemma.startsWith('"') && cleanedLemma.endsWith('"')) ||
          (cleanedLemma.startsWith("'") && cleanedLemma.endsWith("'"))) {
        cleanedLemma = cleanedLemma.slice(1, -1);
      }
      cleanedLemma = cleanedLemma.replace(/^[\s.,;:!?()]+|[\s.,;:!?()]+$/g, '').trim();
      
      if (!cleanedLemma || cleanedLemma.length === 0) {
        cleanedLemma = word;
      }

      // Cache the result
      this.db.cacheLemma(cacheKey, cleanedLemma, targetLanguage);

      console.log('Contextual lemma result:', word, '→', cleanedLemma);
      return { lemma: cleanedLemma, cached: false };
    } catch (error) {
      console.error('Error getting contextual lemma:', error);
      return { lemma: word, cached: false };
    }
  }

  /**
   * Generate a context-aware dictionary entry
   */
  public async generateContextualEntry({
    word,
    sourceLanguage,
    targetLanguage,
    contextSentence
  }: ContextualEntryGenerationRequest): Promise<DictionaryEntry | null> {
    try {
      console.log('Generating contextual entry for:', word, 'in context:', contextSentence);

      // First get the contextual lemma
      const { lemma } = await this.getLemmaWithContext({
        word,
        contextSentence,
        targetLanguage
      });

      // Detect optimal language direction
      const langDirection = await this.detectLanguageDirection(lemma, sourceLanguage, targetLanguage);

      const prompt = await this.loadPrompt('prompt_with_context.txt');
      
      // Use detected language directions
      const processedPrompt = this.processPrompt(prompt, {
        SOURCE_LANGUAGE: langDirection.actualSourceLang,
        TARGET_LANGUAGE: langDirection.actualTargetLang,
        DEFINITION_LANGUAGE: langDirection.definitionLang,
        TARGET_WORD: word,
        SENTENCE_CONTEXT: contextSentence,
      });

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a context-aware dictionary entry creator. Use the provided sentence context to determine the correct meaning, part of speech, and usage of the target word. Include the context sentence as one of the examples."
          },
          {
            role: "user",
            content: processedPrompt + '\n\n' + lemma
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from AI');
      }

      console.log('AI Response received for contextual entry, parsing JSON...');

      // Clean JSON content
      const cleanedContent = responseContent
        .replace(/^\s*```(json)?\s*$/gm, '')
        .replace(/```\s*$/gm, '')
        .trim();

      try {
        const entry = JSON.parse(cleanedContent) as DictionaryEntry;
        
        // Validate the entry structure
        if (!entry.headword || !entry.meanings || !Array.isArray(entry.meanings)) {
          console.error('Invalid contextual entry structure:', entry);
          throw new Error('Invalid entry structure');
        }

        // Ensure metadata reflects context awareness and user's language settings
        entry.metadata = {
          source_language: sourceLanguage,
          target_language: targetLanguage,
          definition_language: langDirection.definitionLang,
          has_context: true,
          context_sentence: contextSentence,
        };

        console.log('Contextual entry generated successfully:', entry.headword);
        return entry;

      } catch (parseError) {
        console.error('Failed to parse contextual AI response as JSON:', parseError);
        console.error('Raw response:', responseContent);
        return null;
      }
    } catch (error) {
      console.error('Error generating contextual entry:', error);
      return null;
    }
  }

  /**
   * Validate a language name
   */
  public async validateLanguage(languageName: string): Promise<{ standardizedName: string; displayName: string }> {
    try {
      const prompt = await this.loadPrompt('language_validation_prompt.txt');
      const processedPrompt = this.processPrompt(prompt, {
        INPUT_LANGUAGE: languageName,
      });

      const response = await this.client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a language identification and standardization assistant. Return only valid JSON."
          },
          {
            role: "user",
            content: processedPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const responseContent = response.choices[0]?.message?.content?.trim();
      if (!responseContent) {
        throw new Error('Empty response from AI');
      }

      try {
        const result = JSON.parse(responseContent);
        return {
          standardizedName: result.standardized_name || languageName,
          displayName: result.display_name || languageName,
        };
      } catch (parseError) {
        console.error('Failed to parse language validation response:', parseError);
        return {
          standardizedName: languageName,
          displayName: languageName,
        };
      }
    } catch (error) {
      console.error('Error validating language:', error);
      return {
        standardizedName: languageName,
        displayName: languageName,
      };
    }
  }

  /**
   * Load a prompt template from file
   */
  private async loadPrompt(filename: string): Promise<string> {
    try {
      const promptPath = path.join(process.cwd(), 'data', 'prompts', filename);
      return await readFile(promptPath, 'utf-8');
    } catch (error) {
      console.error(`Error loading prompt ${filename}:`, error);
      throw new Error(`Failed to load prompt: ${filename}`);
    }
  }

  /**
   * Process prompt template by replacing variables
   */
  private processPrompt(prompt: string, variables: Record<string, string>): string {
    let processedPrompt = prompt;
    
    // Process each variable replacement one by one
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `[${key}]`;
      // Use split and join instead of regex to avoid infinite loops
      processedPrompt = processedPrompt.split(placeholder).join(value);
    });

    return processedPrompt;
  }
}

export default AIManager;