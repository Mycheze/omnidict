import { useAnkiStore } from "@/stores/ankiStore";
import { useMediaStore } from "@/stores/mediaStore";
import {
  AnkiConnect,
  buildFields,
  enqueueAnkiWrite,
  generateMediaValues,
  getPendingWriteCount,
  trackPendingWrite,
} from "@/lib/anki";
import { AnkiCard, ExportContext, MediaType } from "@/lib/types";

export function useAnkiExport() {
  const { deck, noteType, fieldMappings, tags, setLastExportTime } =
    useAnkiStore();
  const { enabledTypes, getConfigForLanguage, apiKeys } = useMediaStore();

  const generateMedia = (
    context: ExportContext,
    ankiConnect: AnkiConnect,
  ): Promise<Partial<Record<MediaType, string>>> =>
    generateMediaValues(context, ankiConnect, {
      enabledTypes,
      fieldMappings,
      apiKeys,
      config: context.targetLanguage
        ? getConfigForLanguage(context.targetLanguage)
        : undefined,
    });

  const exportToAnki = (context: ExportContext): Promise<void> =>
    trackPendingWrite(async () => {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint

      // Slow part runs concurrently across cards; only the note write queues
      const mediaValues = await generateMedia(context, ankiConnect);
      const fields = buildFields(context, fieldMappings, tags, mediaValues);

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
      });
    });

  const updateLastAnkiCard = async (context: ExportContext): Promise<void> => {
    // "Last card" is ambiguous while exports are pending — running this
    // after a queued export would overwrite the just-created note with a
    // different card's fields, so refuse instead of queueing
    if (getPendingWriteCount() > 0) {
      throw new Error(
        "An export is still in progress — wait for it to finish before updating the last card",
      );
    }

    return trackPendingWrite(async () => {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint

      const mediaValues = await generateMedia(context, ankiConnect);
      const allFields = buildFields(context, fieldMappings, tags, mediaValues);

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
      });
    });
  };

  return {
    exportToAnki,
    updateLastAnkiCard,
  };
}
