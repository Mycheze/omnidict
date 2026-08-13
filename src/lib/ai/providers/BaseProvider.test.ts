import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database module before importing BaseProvider
vi.mock("@/lib/database", () => {
  const mockDb = {
    getCachedLemma: vi.fn(),
    cacheLemma: vi.fn(),
  };
  return {
    default: {
      getInstance: () => mockDb,
    },
  };
});

import DatabaseManager from "@/lib/database";
import { BaseProvider, ChatMessage } from "./BaseProvider";

const mockDb = vi.mocked(DatabaseManager.getInstance());

/**
 * Concrete test provider that records calls and returns canned responses.
 */
class TestProvider extends BaseProvider {
  public calls: Array<{
    messages: ChatMessage[];
    options: { temperature?: number; maxTokens?: number; thinking?: boolean };
  }> = [];
  public response = "";

  constructor() {
    super("test-provider");
  }

  protected async callApi(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number; thinking?: boolean },
  ): Promise<string> {
    this.calls.push({ messages, options });
    return this.response;
  }

  /** Expose the last user-message content for prompt assertions */
  lastUserContent(): string {
    const last = this.calls[this.calls.length - 1];
    const user = last.messages.find((m) => m.role === "user");
    return user ? user.content : "";
  }
}

const sampleEntryJson = JSON.stringify({
  metadata: {
    source_language: "English",
    target_language: "Czech",
    definition_language: "Czech",
  },
  headword: "motýl",
  part_of_speech: "noun",
  meanings: [
    {
      definition: "an insect with large colorful wings",
      grammar: { noun_type: "masculine", verb_type: null, comparison: null },
      examples: [
        {
          sentence: "Motýl letí nad loukou.",
          translation: "A butterfly flies over the meadow.",
        },
      ],
    },
  ],
});

describe("BaseProvider language-direction contract", () => {
  let provider: TestProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    provider = new TestProvider();
    mockDb.getCachedLemma.mockResolvedValue(null);
    mockDb.cacheLemma.mockResolvedValue(undefined);
  });

  describe("getLemma", () => {
    it("substitutes base and target languages into the lemma prompt", async () => {
      provider.response = "motýl";

      const result = await provider.getLemma({
        word: "butterfly",
        targetLanguage: "Czech",
        sourceLanguage: "English",
      });

      expect(result).toEqual({ lemma: "motýl", cached: false });
      const content = provider.lastUserContent();
      expect(content).toContain("'butterfly'");
      expect(content).toContain("Czech");
      expect(content).toContain("English");
      // All placeholders must be substituted
      expect(content).not.toMatch(
        /\[(TARGET_WORD|TARGET_LANGUAGE|SOURCE_LANGUAGE)\]/,
      );
    });

    it("defaults the base language to English", async () => {
      provider.response = "pes";

      await provider.getLemma({ word: "dog", targetLanguage: "Czech" });

      expect(provider.lastUserContent()).toContain("English");
    });

    it("caches under a key that includes the base language", async () => {
      provider.response = "motýl";

      await provider.getLemma({
        word: "butterfly",
        targetLanguage: "Czech",
        sourceLanguage: "English",
      });

      expect(mockDb.getCachedLemma).toHaveBeenCalledWith(
        "butterfly|base:English",
        "Czech",
      );
      expect(mockDb.cacheLemma).toHaveBeenCalledWith(
        "butterfly|base:English",
        "motýl",
        "Czech",
      );
    });

    it("returns cached lemma without calling the API", async () => {
      mockDb.getCachedLemma.mockResolvedValue("motýl");

      const result = await provider.getLemma({
        word: "butterfly",
        targetLanguage: "Czech",
      });

      expect(result).toEqual({ lemma: "motýl", cached: true });
      expect(provider.calls).toHaveLength(0);
    });
  });

  describe("getLemmaWithContext", () => {
    it("includes base language in prompt and cache key", async () => {
      provider.response = "běžet";

      await provider.getLemmaWithContext({
        word: "running",
        contextSentence: "I was running fast",
        targetLanguage: "Czech",
        sourceLanguage: "English",
      });

      const content = provider.lastUserContent();
      expect(content).toContain("Czech");
      expect(content).toContain("English");
      expect(content).not.toMatch(
        /\[(TARGET_WORD|TARGET_LANGUAGE|SOURCE_LANGUAGE|SENTENCE_CONTEXT)\]/,
      );

      const cacheKey = mockDb.cacheLemma.mock.calls[0][0];
      expect(cacheKey).toMatch(/^running\|base:English\|ctx:[0-9a-f]{16}$/);
    });
  });

  describe("generateEntry", () => {
    it("passes languages straight through: definitions in the base language", async () => {
      provider.response = sampleEntryJson;

      const entry = await provider.generateEntry({
        word: "motýl",
        sourceLanguage: "English",
        targetLanguage: "Czech",
      });

      expect(entry).not.toBeNull();
      const content = provider.lastUserContent();
      // Definition language must be the base/source language, regardless of
      // diacritics or input language — no detection heuristics.
      expect(content).toContain("Definition Language: English");
      expect(content).toContain("Target Language: Czech");
      expect(content).not.toMatch(
        /\[(SOURCE_LANGUAGE|TARGET_LANGUAGE|DEFINITION_LANGUAGE)\]/,
      );
      expect(entry!.metadata.definition_language).toBe("English");
    });

    it("uses the base language for definitions even for diacritic-free target words", async () => {
      provider.response = sampleEntryJson;

      // "pes" has no diacritics — the old heuristic would have mis-detected it
      await provider.generateEntry({
        word: "pes",
        sourceLanguage: "English",
        targetLanguage: "Czech",
      });

      expect(provider.lastUserContent()).toContain(
        "Definition Language: English",
      );
    });
  });

  describe("generateContextualEntry", () => {
    it("uses the provided lemma without re-lemmatizing and passes languages through", async () => {
      provider.response = sampleEntryJson;

      const entry = await provider.generateContextualEntry({
        word: "butterfly",
        sourceLanguage: "English",
        targetLanguage: "Czech",
        contextSentence: "The butterfly landed on a flower.",
        lemma: "motýl",
      });

      expect(entry).not.toBeNull();
      // Only one API call: entry generation (no lemma call)
      expect(provider.calls).toHaveLength(1);
      const content = provider.lastUserContent();
      expect(content).toContain("Definition Language: English");
      expect(content).toContain("Target Language: Czech");
      expect(content).toContain("'motýl'");
      expect(content).not.toMatch(
        /\[(SOURCE_LANGUAGE|TARGET_LANGUAGE|DEFINITION_LANGUAGE|TARGET_WORD|TARGET_LEMMA|SENTENCE_CONTEXT)\]/,
      );
      expect(entry!.metadata.definition_language).toBe("English");
      expect(entry!.metadata.has_context).toBe(true);
    });

    it("resolves the lemma with the base language when none is provided", async () => {
      provider.response = "motýl";

      await provider.generateContextualEntry({
        word: "butterfly",
        sourceLanguage: "English",
        targetLanguage: "Czech",
        contextSentence: "The butterfly landed on a flower.",
      });

      // First call is the contextual lemma lookup, keyed with the base language
      expect(mockDb.getCachedLemma).toHaveBeenCalledWith(
        expect.stringMatching(/^butterfly\|base:English\|ctx:[0-9a-f]{16}$/),
        "Czech",
      );
    });
  });
});
