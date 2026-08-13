import { describe, it, expect, vi } from "vitest";
import {
  installRefoldNoteType,
  RefoldInstallClient,
} from "./installRefoldNoteType";
import { REFOLD_NOTE_TYPES, REFOLD_FONT_ASSETS } from "./refoldNoteTypes";

const sentenceNoteType = REFOLD_NOTE_TYPES[0];

function makeClient(existingModels: string[]): RefoldInstallClient {
  return {
    getModelNames: vi.fn(async () => existingModels),
    createModel: vi.fn(async () => undefined),
    storeMediaFile: vi.fn(async (filename: string) => filename),
  };
}

describe("installRefoldNoteType", () => {
  it("creates the model when it does not exist", async () => {
    const client = makeClient(["Basic", "Cloze"]);

    const result = await installRefoldNoteType(client, sentenceNoteType);

    expect(result).toEqual({ created: true });
    expect(client.createModel).toHaveBeenCalledTimes(1);
    expect(client.createModel).toHaveBeenCalledWith({
      modelName: sentenceNoteType.name,
      inOrderFields: sentenceNoteType.fields,
      css: sentenceNoteType.css,
      cardTemplates: sentenceNoteType.templates.map((t) => ({
        Name: t.name,
        Front: t.front,
        Back: t.back,
      })),
    });
  });

  it("skips creation when the model already exists", async () => {
    const client = makeClient(["Basic", sentenceNoteType.name]);

    const result = await installRefoldNoteType(client, sentenceNoteType);

    expect(result).toEqual({ created: false });
    expect(client.createModel).not.toHaveBeenCalled();
  });

  it("stores every shared media asset, even when the model already exists", async () => {
    const client = makeClient([sentenceNoteType.name]);

    await installRefoldNoteType(client, sentenceNoteType);

    expect(client.storeMediaFile).toHaveBeenCalledTimes(
      REFOLD_FONT_ASSETS.length,
    );
    for (const asset of REFOLD_FONT_ASSETS) {
      expect(client.storeMediaFile).toHaveBeenCalledWith(
        asset.filename,
        asset.base64,
      );
    }
  });

  it("treats media failures as best-effort and still succeeds", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client: RefoldInstallClient = {
      getModelNames: vi.fn(async () => []),
      createModel: vi.fn(async () => undefined),
      storeMediaFile: vi.fn(async () => {
        throw new Error("disk full");
      }),
    };

    const result = await installRefoldNoteType(client, sentenceNoteType);

    expect(result).toEqual({ created: true });
    expect(client.storeMediaFile).toHaveBeenCalledTimes(
      REFOLD_FONT_ASSETS.length,
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("propagates model creation failures", async () => {
    const client: RefoldInstallClient = {
      getModelNames: vi.fn(async () => []),
      createModel: vi.fn(async () => {
        throw new Error("Anki says no");
      }),
      storeMediaFile: vi.fn(async (filename: string) => filename),
    };

    await expect(
      installRefoldNoteType(client, sentenceNoteType),
    ).rejects.toThrow("Anki says no");
    expect(client.storeMediaFile).not.toHaveBeenCalled();
  });
});
