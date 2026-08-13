import {
  GeneratedMedia,
  LanguageMediaConfig,
  MediaGenerationResult,
  MediaType,
} from "@/lib/types";
import AIManager from "@/lib/ai";
import { IMAGE_STYLES } from "@/lib/media/imageStyles";
import { synthesizeGoogleTts } from "@/lib/media/googleTts";
import { synthesizeElevenLabs } from "@/lib/media/elevenLabs";
import { renderImage } from "@/lib/media/replicate";
import {
  readCachedMedia,
  readCachedText,
  sanitizeForFilename,
  shortHash,
  writeCachedMedia,
  writeCachedText,
} from "@/lib/media/cache";

export interface MediaGenerationParams {
  types: MediaType[];
  headword: string;
  definition?: string;
  sentence?: string;
  targetLanguage: string;
  /**
   * Key selection for the paid APIs (ElevenLabs, Replicate):
   * - true: use the server's env keys (paid Refold users, quota-limited)
   * - false: use ONLY `apiKeys` supplied by the user; a missing key produces
   *   a per-type "KEY_REQUIRED: <provider>" error instead of silently
   *   spending the server's money
   * Google TTS always uses the server's env key (effectively free).
   */
  useServerKeys: boolean;
  /** User-supplied keys for the paid APIs (used when useServerKeys is false) */
  apiKeys?: {
    elevenLabs?: string;
    replicate?: string;
  };
  config: LanguageMediaConfig;
}

/** Quota units a generation request will consume (server-keyed billing) */
export interface QuotaRequest {
  imagesReq: number;
  ttsReq: number;
}

/**
 * Compute how many quota units a request consumes. Only ElevenLabs usage
 * counts toward the TTS quota — wordAudio goes through Google TTS, which is
 * env-keyed and effectively free, so only sentenceAudio is counted. Types
 * are deduplicated, matching how results are keyed per type.
 */
export function computeQuotaRequest(types: MediaType[]): QuotaRequest {
  const unique = new Set(types);
  return {
    imagesReq: unique.has("image") ? 1 : 0,
    ttsReq: unique.has("sentenceAudio") ? 1 : 0,
  };
}

/** Parse a positive-integer env var, falling back when missing/invalid */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Monthly quota limits for paid users, from env with sane defaults */
export function getMediaQuotaLimits(): {
  imageLimit: number;
  ttsLimit: number;
} {
  return {
    imageLimit: parsePositiveInt(process.env.MEDIA_QUOTA_IMAGES_PER_MONTH, 300),
    ttsLimit: parsePositiveInt(process.env.MEDIA_QUOTA_TTS_PER_MONTH, 600),
  };
}

/** Current UTC quota period as YYYY-MM */
export function currentUsagePeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * MediaService - generates flashcard media (images, word audio, sentence
 * audio) for Anki export. Results are cached on disk (best-effort) so the
 * same word/sentence never bills twice; on read-only hosts the cache is
 * simply skipped.
 */
export class MediaService {
  private static instance: MediaService | null = null;

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  public async generate(
    params: MediaGenerationParams,
  ): Promise<MediaGenerationResult> {
    const result: MediaGenerationResult = {};
    const errors: Partial<Record<MediaType, string>> = {};

    // The three media types hit three different APIs — run them concurrently
    await Promise.all(
      params.types.map(async (type) => {
        try {
          switch (type) {
            case "wordAudio":
              result.wordAudio = await this.generateWordAudio(params);
              break;
            case "sentenceAudio":
              result.sentenceAudio = await this.generateSentenceAudio(params);
              break;
            case "image":
              result.image = await this.generateImage(params);
              break;
            default:
              throw new Error(`Unknown media type: ${type}`);
          }
        } catch (error) {
          errors[type] =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`MediaService: ${type} generation failed:`, error);
        }
      }),
    );

    if (Object.keys(errors).length > 0) {
      result.errors = errors;
    }
    return result;
  }

  /**
   * Resolve the API key for a paid provider (ElevenLabs / Replicate) per the
   * key-selection policy. Throws (caught by generate() into result.errors):
   * - useServerKeys + env key missing → "Server API key not configured"
   * - user keys + user key missing → "KEY_REQUIRED: <provider>" so the
   *   client can prompt for a key instead of showing a raw failure
   */
  private selectPaidApiKey(
    params: MediaGenerationParams,
    provider: "elevenLabs" | "replicate",
  ): string {
    if (params.useServerKeys) {
      const envKey =
        provider === "elevenLabs"
          ? process.env.ELEVENLABS_API_KEY
          : process.env.REPLICATE_API_TOKEN;
      if (!envKey) {
        throw new Error("Server API key not configured");
      }
      return envKey;
    }

    const userKey = params.apiKeys?.[provider];
    if (!userKey) {
      throw new Error(`KEY_REQUIRED: ${provider}`);
    }
    return userKey;
  }

  private async generateWordAudio(
    params: MediaGenerationParams,
  ): Promise<GeneratedMedia> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_TTS_API_KEY is not configured");
    }
    if (!params.config.googleLanguageCode) {
      throw new Error(
        `No Google TTS language code configured for ${params.targetLanguage}`,
      );
    }

    // Key includes the raw headword (accent-folding can collide, e.g. Czech
    // byt/být) and the voice config, so changing voices regenerates audio
    const discriminator = shortHash(
      [
        params.headword,
        params.config.googleLanguageCode,
        params.config.googleVoiceName,
      ].join("|"),
      8,
    );
    const filename = this.buildFilename(params, `${discriminator}_word`, "mp3");
    const cached = await readCachedMedia(filename);
    if (cached) {
      return this.toMedia(filename, cached, "audio/mpeg", true);
    }

    const audio = await synthesizeGoogleTts({
      text: params.headword,
      languageCode: params.config.googleLanguageCode,
      voiceName: params.config.googleVoiceName || undefined,
      apiKey,
    });

    await writeCachedMedia(filename, audio);
    return this.toMedia(filename, audio, "audio/mpeg", false);
  }

  private async generateSentenceAudio(
    params: MediaGenerationParams,
  ): Promise<GeneratedMedia> {
    const apiKey = this.selectPaidApiKey(params, "elevenLabs");
    if (!params.sentence) {
      throw new Error("No sentence provided for sentence audio");
    }
    if (!params.config.elevenLabsVoiceId) {
      throw new Error(
        `No ElevenLabs voice ID configured for ${params.targetLanguage}`,
      );
    }

    // Key includes the sentence and the voice config, so changing voice or
    // speed regenerates instead of serving stale audio forever
    const discriminator = shortHash(
      [
        params.sentence,
        params.config.elevenLabsVoiceId,
        params.config.elevenLabsLanguageCode,
        String(params.config.elevenLabsSpeed),
      ].join("|"),
      8,
    );
    const filename = this.buildFilename(
      params,
      `${discriminator}_sentence`,
      "mp3",
    );
    const cached = await readCachedMedia(filename);
    if (cached) {
      return this.toMedia(filename, cached, "audio/mpeg", true);
    }

    const audio = await synthesizeElevenLabs({
      text: params.sentence,
      voiceId: params.config.elevenLabsVoiceId,
      languageCode: params.config.elevenLabsLanguageCode || undefined,
      speed: params.config.elevenLabsSpeed,
      apiKey,
    });

    await writeCachedMedia(filename, audio);
    return this.toMedia(filename, audio, "audio/mpeg", false);
  }

  private async generateImage(
    params: MediaGenerationParams,
  ): Promise<GeneratedMedia> {
    const apiKey = this.selectPaidApiKey(params, "replicate");
    if (!params.definition) {
      throw new Error("No definition provided for image generation");
    }

    const style = params.config.imageStyle;
    // Key includes definition + sentence: different senses of one headword
    // must not share an image (or overwrite each other's Anki media file)
    const discriminator = shortHash(
      [params.headword, params.definition, params.sentence || "", style].join(
        "|",
      ),
      8,
    );
    const filename = this.buildFilename(
      params,
      `${discriminator}_${style}`,
      "jpg",
    );
    const cached = await readCachedMedia(filename);
    if (cached) {
      return this.toMedia(filename, cached, "image/jpeg", true);
    }

    // Prompt text is cached separately so a failed render (bad Replicate
    // key, outage) doesn't re-bill the LLM prompt generation on retry
    const promptCacheFile = `${filename}.prompt.txt`;
    let prompt = await readCachedText(promptCacheFile);
    if (!prompt) {
      prompt = await AIManager.getInstance().generateImagePrompt({
        headword: params.headword,
        definition: params.definition,
        exampleSentence: params.sentence,
        style,
      });
      if (!prompt) {
        throw new Error("Image prompt generation failed — render skipped");
      }
      await writeCachedText(promptCacheFile, prompt);
    }

    const image = await renderImage({
      prompt: IMAGE_STYLES[style].renderPrefix + prompt,
      apiKey,
    });

    await writeCachedMedia(filename, image);
    return this.toMedia(filename, image, "image/jpeg", false);
  }

  private buildFilename(
    params: MediaGenerationParams,
    suffix: string,
    extension: string,
  ): string {
    const lang = sanitizeForFilename(params.targetLanguage);
    const word = sanitizeForFilename(params.headword);
    return `omnidict_${lang}_${word}_${suffix}.${extension}`;
  }

  private toMedia(
    filename: string,
    data: Buffer,
    mimeType: string,
    cached: boolean,
  ): GeneratedMedia {
    return { filename, data: data.toString("base64"), mimeType, cached };
  }
}
