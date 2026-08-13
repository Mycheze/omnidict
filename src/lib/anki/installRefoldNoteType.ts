import { RefoldNoteType, REFOLD_FONT_ASSETS } from "./refoldNoteTypes";

/**
 * The subset of the AnkiConnect client needed to install a note type.
 * Structural so tests (and future callers) can supply a lightweight mock;
 * the real `AnkiConnect` class satisfies it.
 */
export interface RefoldInstallClient {
  getModelNames(): Promise<string[]>;
  createModel(model: {
    modelName: string;
    inOrderFields: string[];
    css: string;
    cardTemplates: { Name: string; Front: string; Back: string }[];
  }): Promise<void>;
  storeMediaFile(filename: string, base64Data: string): Promise<string>;
}

/**
 * Install a Refold note type into the connected Anki instance.
 *
 * - Skips creation if a model with the same name already exists.
 * - Always pushes the shared media assets (fonts, template icons) into
 *   Anki's media store so the styling renders; storeMediaFile overwrites
 *   by filename, so this is idempotent. Media failures are best-effort:
 *   the note type still works, just without the custom fonts/icons.
 */
export async function installRefoldNoteType(
  client: RefoldInstallClient,
  noteType: RefoldNoteType,
): Promise<{ created: boolean }> {
  const existingModels = await client.getModelNames();
  let created = false;

  if (!existingModels.includes(noteType.name)) {
    await client.createModel({
      modelName: noteType.name,
      inOrderFields: noteType.fields,
      css: noteType.css,
      cardTemplates: noteType.templates.map((template) => ({
        Name: template.name,
        Front: template.front,
        Back: template.back,
      })),
    });
    created = true;
  }

  for (const asset of REFOLD_FONT_ASSETS) {
    try {
      await client.storeMediaFile(asset.filename, asset.base64);
    } catch (error) {
      console.warn(
        `Failed to store Anki media asset ${asset.filename}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { created };
}
