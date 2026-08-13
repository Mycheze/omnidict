import { AnkiConnect } from "./ankiConnect";
import {
  AnkiFieldMapping,
  ApiResponse,
  ExportContext,
  LanguageMediaConfig,
  MediaGenerationResult,
  MediaType,
} from "@/lib/types";

/**
 * Pure card-export logic: turning an ExportContext plus user settings into
 * Anki note fields. No store access — callers pass everything in, so this
 * module works the same from a hook, a queue flusher, or a test.
 */

const MEDIA_FIELDS: MediaType[] = ["image", "wordAudio", "sentenceAudio"];

export interface GenerateMediaOptions {
  enabledTypes: Record<MediaType, boolean>;
  fieldMappings: AnkiFieldMapping[];
  /** User-supplied provider keys (ElevenLabs / Replicate) */
  apiKeys: { elevenLabs: string; replicate: string };
  /** Per-language media config; only needed when context.targetLanguage is set */
  config?: LanguageMediaConfig;
}

/**
 * Build the Anki note fields for a card from the export context and the
 * user's field mappings. Media field values (img/sound tags) come
 * pre-formatted in `mediaValues`.
 */
export function buildFields(
  context: ExportContext,
  fieldMappings: AnkiFieldMapping[],
  tags: string[],
  mediaValues: Partial<Record<MediaType, string>>,
): Record<string, string> {
  const fields: Record<string, string> = {};

  fieldMappings.forEach((mapping) => {
    if (mapping.deepDictField === "none") {
      return;
    }

    let value = "";
    switch (mapping.deepDictField) {
      case "headword":
        value = context.headword;
        break;
      case "definition":
        value = context.definition;
        break;
      case "partOfSpeech":
        value = Array.isArray(context.partOfSpeech)
          ? context.partOfSpeech.join(", ")
          : context.partOfSpeech;
        break;
      case "example":
        value = context.example;
        break;
      case "translation":
        value = context.translation || "";
        break;
      case "tags":
        value = mapping.staticValue || tags.join(" ");
        break;
      case "image":
      case "wordAudio":
      case "sentenceAudio":
        value = mediaValues[mapping.deepDictField] || "";
        break;
      default:
        break;
    }

    fields[mapping.ankiField] = value;
  });

  return fields;
}

/**
 * Generate any mapped+enabled media for this context, store the files in
 * Anki, and return field values (img/sound tags) keyed by media type.
 * Media failures never block the export — errors are swallowed and the card
 * just goes out without that media (partial results are returned).
 */
export async function generateMediaValues(
  context: ExportContext,
  ankiClient: AnkiConnect,
  opts: GenerateMediaOptions,
): Promise<Partial<Record<MediaType, string>>> {
  const neededTypes = MEDIA_FIELDS.filter(
    (type) =>
      opts.enabledTypes[type] &&
      opts.fieldMappings.some((m) => m.deepDictField === type),
  );

  if (neededTypes.length === 0) {
    return {};
  }
  if (!context.targetLanguage) {
    console.warn(
      "Anki export: media fields mapped but no target language in context — skipping media",
    );
    return {};
  }

  try {
    const response = await fetch("/api/media/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        types: neededTypes,
        headword: context.headword,
        definition: context.definition,
        sentence: context.example,
        targetLanguage: context.targetLanguage,
        apiKeys: opts.apiKeys,
        config: opts.config,
      }),
    });

    const body: ApiResponse<MediaGenerationResult> = await response.json();
    if (!response.ok || !body.success || !body.data) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const result = body.data;
    if (result.errors) {
      console.warn("Some media failed to generate:", result.errors);
    }

    // The files are independent — store them in Anki concurrently
    const values: Partial<Record<MediaType, string>> = {};
    await Promise.all(
      neededTypes.map(async (type) => {
        const media = result[type];
        if (!media) return;
        await ankiClient.storeMediaFile(media.filename, media.data);
        values[type] =
          type === "image"
            ? `<img src="${media.filename}">`
            : `[sound:${media.filename}]`;
      }),
    );
    return values;
  } catch (error) {
    console.warn("Media generation failed, exporting without media:", error);
    return {};
  }
}

/**
 * Stable content-based identity for an export, so the same card queued twice
 * can be deduplicated. SHA-256 hex over the fields that define "the same
 * card". Uses Web Crypto, so it works in the browser (and modern Node).
 */
export async function computeDedupKey(context: ExportContext): Promise<string> {
  const input = [
    context.headword,
    context.definition,
    context.example,
    context.targetLanguage ?? "",
  ].join("|");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
