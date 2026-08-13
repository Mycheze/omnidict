import { describe, it, expect } from "vitest";
import { buildFields, computeDedupKey } from "./exportCard";
import { AnkiFieldMapping, ExportContext } from "@/lib/types";

const context: ExportContext = {
  headword: "kočka",
  definition: "a cat",
  partOfSpeech: ["noun", "feminine"],
  example: "Kočka spí.",
  translation: "The cat sleeps.",
  targetLanguage: "Czech",
};

describe("buildFields", () => {
  it("maps context values onto Anki fields", () => {
    const mappings: AnkiFieldMapping[] = [
      { ankiField: "Front", deepDictField: "headword" },
      { ankiField: "Back", deepDictField: "definition" },
      { ankiField: "POS", deepDictField: "partOfSpeech" },
      { ankiField: "Sentence", deepDictField: "example" },
      { ankiField: "Translation", deepDictField: "translation" },
      { ankiField: "Ignored", deepDictField: "none" },
    ];

    const fields = buildFields(context, mappings, ["omnidict"], {});

    expect(fields).toEqual({
      Front: "kočka",
      Back: "a cat",
      POS: "noun, feminine",
      Sentence: "Kočka spí.",
      Translation: "The cat sleeps.",
    });
  });

  it("uses staticValue for tags when present, joined tags otherwise", () => {
    const withStatic = buildFields(
      context,
      [{ ankiField: "Tags", deepDictField: "tags", staticValue: "fixed" }],
      ["a", "b"],
      {},
    );
    const withoutStatic = buildFields(
      context,
      [{ ankiField: "Tags", deepDictField: "tags" }],
      ["a", "b"],
      {},
    );

    expect(withStatic.Tags).toBe("fixed");
    expect(withoutStatic.Tags).toBe("a b");
  });

  it("fills media fields from mediaValues, empty when missing", () => {
    const mappings: AnkiFieldMapping[] = [
      { ankiField: "Picture", deepDictField: "image" },
      { ankiField: "Audio", deepDictField: "wordAudio" },
    ];

    const fields = buildFields(context, mappings, [], {
      image: '<img src="kocka.webp">',
    });

    expect(fields.Picture).toBe('<img src="kocka.webp">');
    expect(fields.Audio).toBe("");
  });
});

describe("computeDedupKey", () => {
  it("is a stable sha256 hex of the identifying fields", async () => {
    const key = await computeDedupKey(context);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeDedupKey({ ...context })).toBe(key);
  });

  it("changes when an identifying field changes and ignores others", async () => {
    const key = await computeDedupKey(context);

    expect(await computeDedupKey({ ...context, headword: "pes" })).not.toBe(
      key,
    );
    expect(
      await computeDedupKey({ ...context, targetLanguage: undefined }),
    ).not.toBe(key);
    // translation/partOfSpeech are not part of card identity
    expect(
      await computeDedupKey({
        ...context,
        translation: "different",
        partOfSpeech: "verb",
      }),
    ).toBe(key);
  });
});
