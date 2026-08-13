import { describe, it, expect } from "vitest";
import {
  REFOLD_NOTE_TYPES,
  REFOLD_FONT_ASSETS,
  REFOLD_DEFAULT_FIELD_MAPPINGS,
} from "./refoldNoteTypes";
import { AnkiFieldMapping } from "@/lib/types";

const EXPECTED_NAMES = [
  "Refold Sentence Miner: Sentence",
  "Refold Sentence Miner: Sentence Hidden",
  "Refold Sentence Miner: Listening",
  "Refold Sentence Miner: Word Only",
];

const EXPECTED_FIELDS = [
  "Word",
  "Definitions",
  "Example Sentence",
  "Sentence Translation",
  "word_audio",
  "sentence_audio",
  "image",
];

const VALID_DEEP_DICT_FIELDS: AnkiFieldMapping["deepDictField"][] = [
  "headword",
  "definition",
  "partOfSpeech",
  "example",
  "translation",
  "tags",
  "image",
  "wordAudio",
  "sentenceAudio",
  "none",
];

// _Inter-Medium.ttf is referenced by the CSS but intentionally not bundled
// (size budget); Anki falls back to a neighboring Inter weight.
const KNOWN_SKIPPED_ASSETS = ["_Inter-Medium.ttf"];

describe("REFOLD_NOTE_TYPES", () => {
  it("ships the 4 generic Refold models, Sentence (recommended) first", () => {
    expect(REFOLD_NOTE_TYPES.map((nt) => nt.name)).toEqual(EXPECTED_NAMES);
  });

  it("every model has the 7 shared fields in order", () => {
    for (const noteType of REFOLD_NOTE_TYPES) {
      expect(noteType.fields).toEqual(EXPECTED_FIELDS);
    }
  });

  it("every model has non-empty css and one template with front/back", () => {
    for (const noteType of REFOLD_NOTE_TYPES) {
      expect(noteType.css.length).toBeGreaterThan(0);
      expect(noteType.templates).toHaveLength(1);
      for (const template of noteType.templates) {
        expect(template.name.length).toBeGreaterThan(0);
        expect(template.front.length).toBeGreaterThan(0);
        expect(template.back.length).toBeGreaterThan(0);
      }
    }
  });

  it("card templates only reference fields that exist on the model", () => {
    for (const noteType of REFOLD_NOTE_TYPES) {
      for (const template of noteType.templates) {
        const refs =
          (template.front + template.back).match(
            /{{[#/^]?(?:hint:)?([^}]+)}}/g,
          ) ?? [];
        for (const ref of refs) {
          const field = ref.replace(/^{{[#/^]?(hint:)?/, "").replace(/}}$/, "");
          if (field === "FrontSide") continue; // Anki built-in
          expect(noteType.fields).toContain(field);
        }
      }
    }
  });
});

describe("REFOLD_FONT_ASSETS", () => {
  it("bundles every _-prefixed asset the css/templates reference (minus documented skips)", () => {
    const bundled = new Set(REFOLD_FONT_ASSETS.map((a) => a.filename));

    for (const noteType of REFOLD_NOTE_TYPES) {
      const blobs = [
        noteType.css,
        ...noteType.templates.flatMap((t) => [t.front, t.back]),
      ];
      for (const blob of blobs) {
        const refs = blob.match(/_[A-Za-z0-9_.-]*\.[A-Za-z0-9]+/g) ?? [];
        for (const ref of refs) {
          if (KNOWN_SKIPPED_ASSETS.includes(ref)) continue;
          expect(bundled, `missing asset ${ref}`).toContain(ref);
        }
      }
    }
  });

  it("every bundled asset is referenced and carries valid base64 payload", () => {
    const allBlobs = REFOLD_NOTE_TYPES.flatMap((nt) => [
      nt.css,
      ...nt.templates.flatMap((t) => [t.front, t.back]),
    ]).join("\n");

    expect(REFOLD_FONT_ASSETS.length).toBeGreaterThan(0);
    for (const asset of REFOLD_FONT_ASSETS) {
      expect(asset.filename.startsWith("_")).toBe(true);
      expect(allBlobs).toContain(asset.filename);
      expect(asset.base64.length).toBeGreaterThan(0);
      expect(asset.base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });

  it("includes the Inter font weights and the template icon", () => {
    const filenames = REFOLD_FONT_ASSETS.map((a) => a.filename);
    expect(filenames).toContain("_Inter-Regular.ttf");
    expect(filenames).toContain("_Inter-SemiBold.ttf");
    expect(filenames).toContain("_youtube_icon.png");
  });
});

describe("REFOLD_DEFAULT_FIELD_MAPPINGS", () => {
  it("maps every Refold field exactly once to a valid deepDictField", () => {
    expect(REFOLD_DEFAULT_FIELD_MAPPINGS.map((m) => m.ankiField)).toEqual(
      EXPECTED_FIELDS,
    );

    for (const mapping of REFOLD_DEFAULT_FIELD_MAPPINGS) {
      expect(VALID_DEEP_DICT_FIELDS).toContain(mapping.deepDictField);
      expect(mapping.deepDictField).not.toBe("none");
    }
  });

  it("maps the expected omnidict fields", () => {
    const byAnkiField = Object.fromEntries(
      REFOLD_DEFAULT_FIELD_MAPPINGS.map((m) => [m.ankiField, m.deepDictField]),
    );

    expect(byAnkiField).toEqual({
      Word: "headword",
      Definitions: "definition",
      "Example Sentence": "example",
      "Sentence Translation": "translation",
      word_audio: "wordAudio",
      sentence_audio: "sentenceAudio",
      image: "image",
    });
  });
});
