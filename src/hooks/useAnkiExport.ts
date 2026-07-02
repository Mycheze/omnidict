import { useAnkiStore } from "@/stores/ankiStore";
import { useMediaStore } from "@/stores/mediaStore";
import { AnkiConnect } from "@/lib/anki/ankiConnect";
import {
  AnkiCard,
  ApiResponse,
  ExportContext,
  MediaGenerationResult,
  MediaType,
} from "@/lib/types";

const MEDIA_FIELDS: MediaType[] = ["image", "wordAudio", "sentenceAudio"];

/**
 * Media generation (10-20s) runs concurrently per card so the app stays
 * usable, but the actual Anki note writes are serialized through this queue:
 * note creation order must follow click order for "update last card"
 * semantics to make sense. Module-level so every component shares one queue.
 */
let ankiWriteQueue: Promise<void> = Promise.resolve();
let pendingOperations = 0;

function enqueueAnkiWrite<T>(job: () => Promise<T>): Promise<T> {
  const run = ankiWriteQueue.then(job, job);
  ankiWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function useAnkiExport() {
  const { deck, noteType, fieldMappings, tags, setLastExportTime } =
    useAnkiStore();
  const { enabledTypes, getConfigForLanguage, apiKeys } = useMediaStore();

  /**
   * Generate any mapped+enabled media for this context, store the files in
   * Anki, and return field values (img/sound tags) keyed by media type.
   * Media failures never block the export — the card just goes out without
   * that media.
   */
  const generateMediaValues = async (
    context: ExportContext,
    ankiConnect: AnkiConnect,
  ): Promise<Partial<Record<MediaType, string>>> => {
    const neededTypes = MEDIA_FIELDS.filter(
      (type) =>
        enabledTypes[type] &&
        fieldMappings.some((m) => m.deepDictField === type),
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
          apiKeys,
          config: getConfigForLanguage(context.targetLanguage),
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
          await ankiConnect.storeMediaFile(media.filename, media.data);
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
  };

  const buildFields = (
    context: ExportContext,
    mediaValues: Partial<Record<MediaType, string>>,
  ): Record<string, string> => {
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
  };

  const exportToAnki = async (context: ExportContext): Promise<void> => {
    pendingOperations++;
    try {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint

      // Slow part runs concurrently across cards; only the note write queues
      const mediaValues = await generateMediaValues(context, ankiConnect);
      const fields = buildFields(context, mediaValues);

      // Create the card
      const card: AnkiCard = {
        deckName: deck,
        modelName: noteType,
        fields,
        tags: [...tags],
      };

      await enqueueAnkiWrite(async () => {
        const noteId = await ankiConnect.addNote(card);

        if (!noteId) {
          throw new Error("Failed to create note in Anki");
        }

        setLastExportTime(Date.now());
        console.log("Successfully exported to Anki, note ID:", noteId);
      });
    } finally {
      pendingOperations--;
    }
  };

  const updateLastAnkiCard = async (context: ExportContext): Promise<void> => {
    // "Last card" is ambiguous while exports are pending — running this
    // after a queued export would overwrite the just-created note with a
    // different card's fields, so refuse instead of queueing
    if (pendingOperations > 0) {
      throw new Error(
        "An export is still in progress — wait for it to finish before updating the last card",
      );
    }

    pendingOperations++;
    try {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint

      const mediaValues = await generateMediaValues(context, ankiConnect);
      const allFields = buildFields(context, mediaValues);

      // Only include fields that have actual content (don't overwrite with empty values)
      const fields: Record<string, string> = {};
      Object.entries(allFields).forEach(([field, value]) => {
        if (value.trim()) {
          fields[field] = value;
        }
      });

      await enqueueAnkiWrite(async () => {
        // Update the most recent card in the deck
        await ankiConnect.updateMostRecentNote(deck, fields);

        setLastExportTime(Date.now());
        console.log(
          "Successfully updated last Anki card with fields:",
          Object.keys(fields),
        );
      });
    } finally {
      pendingOperations--;
    }
  };

  return {
    exportToAnki,
    updateLastAnkiCard,
  };
}
