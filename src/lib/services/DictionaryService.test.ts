import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeSampleEntry,
  makeSampleEntryWithContext,
} from "@/test/helpers/fixtures";

// Mock the database module
vi.mock("@/lib/database", () => {
  const mockDb = {
    getInstance: vi.fn(),
    getEntryByHeadword: vi.fn(),
    addEntry: vi.fn(),
    deleteEntry: vi.fn(),
    replaceEntry: vi.fn(),
    searchEntries: vi.fn(),
    getSearchSuggestions: vi.fn(),
    getEntriesForLanguages: vi.fn(),
    getSimilarEntries: vi.fn(),
    getRecentEntries: vi.fn(),
    getAllLanguages: vi.fn(),
    getSearchStats: vi.fn(),
    getCacheStats: vi.fn(),
    getDatabaseStats: vi.fn(),
    getDatabaseHealthReport: vi.fn(),
    clearExpiredLemmaCache: vi.fn(),
    runMaintenance: vi.fn(),
    checkMigrationNeeded: vi.fn(),
    runMigrations: vi.fn(),
    initializeSampleData: vi.fn(),
    getEntryCount: vi.fn(),
  };
  return {
    default: {
      ...mockDb,
      getInstance: () => mockDb,
    },
  };
});

// Mock the AI module
vi.mock("@/lib/ai", () => {
  const mockAi = {
    getInstance: vi.fn(),
    configure: vi.fn(),
    getLemma: vi.fn(),
    getLemmaWithContext: vi.fn(),
    generateEntry: vi.fn(),
    generateContextualEntry: vi.fn(),
    regenerateEntry: vi.fn(),
  };
  return {
    default: {
      ...mockAi,
      getInstance: () => mockAi,
      configure: mockAi.configure,
      createProviderInstance: vi.fn(() => mockAi),
    },
  };
});

import DatabaseManager from "@/lib/database";
import AIManager from "@/lib/ai";
import { DictionaryService } from "./DictionaryService";

// Create properly typed mock references
const mockDb = vi.mocked(DatabaseManager.getInstance());
const mockAi = vi.mocked(AIManager.getInstance());

describe("DictionaryService", () => {
  let service: DictionaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset the singleton via module re-import pattern
    // @ts-expect-error -- resetting private static for test isolation
    DictionaryService.instance = undefined;
    service = DictionaryService.getInstance();
  });

  describe("createEntry", () => {
    it("creates entry via lemma → dedup → AI → save flow", async () => {
      mockAi.getLemma.mockResolvedValue({ lemma: "hello", cached: false });
      mockDb.getEntryByHeadword.mockResolvedValue(null);

      const generatedEntry = makeSampleEntry();
      mockAi.generateEntry.mockResolvedValue(generatedEntry);
      mockDb.addEntry.mockResolvedValue(1);

      const result = await service.createEntry("hello", "English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry!.headword).toBe("hello");
      expect(mockAi.getLemma).toHaveBeenCalledWith({
        word: "hello",
        targetLanguage: "Czech",
        sourceLanguage: "English",
      });
      expect(mockDb.addEntry).toHaveBeenCalledWith(generatedEntry);
    });

    it("returns existing entry if duplicate detected", async () => {
      const existingEntry = makeSampleEntry();
      mockAi.getLemma.mockResolvedValue({ lemma: "hello", cached: true });
      mockDb.getEntryByHeadword.mockResolvedValue(existingEntry);

      const result = await service.createEntry("hello", "English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entry).toBe(existingEntry);
      expect(mockAi.generateEntry).not.toHaveBeenCalled();
      expect(mockDb.addEntry).not.toHaveBeenCalled();
    });

    it("uses contextual methods when context is provided", async () => {
      mockAi.getLemmaWithContext.mockResolvedValue({
        lemma: "run",
        cached: false,
      });
      mockDb.getEntryByHeadword.mockResolvedValue(null);

      const entry = makeSampleEntryWithContext();
      mockAi.generateContextualEntry.mockResolvedValue(entry);
      mockDb.addEntry.mockResolvedValue(2);

      const result = await service.createEntry(
        "running",
        "English",
        "Czech",
        "I was running fast",
      );

      expect(result.success).toBe(true);
      expect(mockAi.getLemmaWithContext).toHaveBeenCalledWith({
        word: "running",
        contextSentence: "I was running fast",
        targetLanguage: "Czech",
        sourceLanguage: "English",
      });
      expect(mockAi.generateContextualEntry).toHaveBeenCalled();
    });

    it("checks both original word and lemma for duplicates", async () => {
      mockAi.getLemma.mockResolvedValue({ lemma: "run", cached: false });
      const existingEntry = makeSampleEntry({ headword: "run" });
      mockDb.getEntryByHeadword
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntry);

      const result = await service.createEntry("running", "English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entry).toBe(existingEntry);
      expect(mockDb.getEntryByHeadword).toHaveBeenCalledTimes(2);
    });

    it("returns error when AI fails to generate", async () => {
      mockAi.getLemma.mockResolvedValue({ lemma: "hello", cached: false });
      mockDb.getEntryByHeadword.mockResolvedValue(null);
      mockAi.generateEntry.mockResolvedValue(null);

      const result = await service.createEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to generate");
    });

    it("returns error when database save fails", async () => {
      mockAi.getLemma.mockResolvedValue({ lemma: "hello", cached: false });
      mockDb.getEntryByHeadword.mockResolvedValue(null);
      mockAi.generateEntry.mockResolvedValue(makeSampleEntry());
      mockDb.addEntry.mockResolvedValue(null);

      const result = await service.createEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to save");
    });

    it("handles thrown errors gracefully", async () => {
      mockAi.getLemma.mockRejectedValue(new Error("Network error"));

      const result = await service.createEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("getEntry", () => {
    it("returns entry when found", async () => {
      const entry = makeSampleEntry();
      mockDb.getEntryByHeadword.mockResolvedValue(entry);

      const result = await service.getEntry("hello", "English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entry).toBe(entry);
    });

    it("returns error when not found", async () => {
      mockDb.getEntryByHeadword.mockResolvedValue(null);

      const result = await service.getEntry("missing", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("handles thrown errors", async () => {
      mockDb.getEntryByHeadword.mockRejectedValue(new Error("DB error"));

      const result = await service.getEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("deleteEntry", () => {
    it("returns success when entry deleted", async () => {
      mockDb.deleteEntry.mockResolvedValue(true);
      const result = await service.deleteEntry("hello", "English", "Czech");
      expect(result.success).toBe(true);
    });

    it("returns error when entry not found", async () => {
      mockDb.deleteEntry.mockResolvedValue(false);
      const result = await service.deleteEntry("hello", "English", "Czech");
      expect(result.success).toBe(false);
    });

    it("handles thrown errors", async () => {
      mockDb.deleteEntry.mockRejectedValue(new Error("DB error"));

      const result = await service.deleteEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("regenerateEntry", () => {
    it("follows generate → replace flow", async () => {
      const existingEntry = makeSampleEntry();
      const newEntry = makeSampleEntry({ part_of_speech: "verb" });

      mockDb.getEntryByHeadword.mockResolvedValue(existingEntry);
      mockAi.regenerateEntry.mockResolvedValue(newEntry);
      mockDb.replaceEntry.mockResolvedValue(true);

      const result = await service.regenerateEntry("hello", "English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entry!.part_of_speech).toBe("verb");
      expect(mockDb.replaceEntry).toHaveBeenCalledWith(
        "hello",
        "English",
        "Czech",
        newEntry,
      );
    });

    it("returns error if entry does not exist", async () => {
      mockDb.getEntryByHeadword.mockResolvedValue(null);

      const result = await service.regenerateEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error if replace fails", async () => {
      mockDb.getEntryByHeadword.mockResolvedValue(makeSampleEntry());
      mockAi.regenerateEntry.mockResolvedValue(makeSampleEntry());
      mockDb.replaceEntry.mockResolvedValue(false);

      const result = await service.regenerateEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to save");
    });

    it("returns error if AI regeneration fails", async () => {
      mockDb.getEntryByHeadword.mockResolvedValue(makeSampleEntry());
      mockDb.deleteEntry.mockResolvedValue(true);
      mockAi.regenerateEntry.mockResolvedValue(null);

      const result = await service.regenerateEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to regenerate");
    });

    it("returns error if AI regeneration returns null", async () => {
      mockDb.getEntryByHeadword.mockResolvedValue(makeSampleEntry());
      mockAi.regenerateEntry.mockResolvedValue(null);

      const result = await service.regenerateEntry("hello", "English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to regenerate");
    });
  });

  describe("searchEntries", () => {
    it("returns search results", async () => {
      const searchResult = {
        entries: [makeSampleEntry()],
        total: 1,
        page: 1,
        pageSize: 50,
      };
      mockDb.searchEntries.mockResolvedValue(searchResult);

      const result = await service.searchEntries({ searchTerm: "hello" });

      expect(result.success).toBe(true);
      expect(result.result).toBe(searchResult);
      expect(mockDb.searchEntries).toHaveBeenCalledWith(
        { searchTerm: "hello" },
        1,
        50,
      );
    });

    it("passes page and pageSize parameters", async () => {
      mockDb.searchEntries.mockResolvedValue({
        entries: [],
        total: 0,
        page: 2,
        pageSize: 20,
      });

      await service.searchEntries({ searchTerm: "test" }, 2, 20);

      expect(mockDb.searchEntries).toHaveBeenCalledWith(
        { searchTerm: "test" },
        2,
        20,
      );
    });

    it("handles thrown errors", async () => {
      mockDb.searchEntries.mockRejectedValue(new Error("Search failed"));

      const result = await service.searchEntries({});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Search failed");
    });
  });

  describe("getEntriesForLanguages", () => {
    it("returns entries for language pair", async () => {
      const entries = [makeSampleEntry()];
      mockDb.getEntriesForLanguages.mockResolvedValue({ entries, total: 1 });

      const result = await service.getEntriesForLanguages("English", "Czech");

      expect(result.success).toBe(true);
      expect(result.result!.entries).toBe(entries);
      expect(mockDb.getEntriesForLanguages).toHaveBeenCalledWith(
        "English",
        "Czech",
        1,
        200,
      );
    });

    it("passes custom pagination", async () => {
      mockDb.getEntriesForLanguages.mockResolvedValue({
        entries: [],
        total: 0,
      });

      await service.getEntriesForLanguages("English", "Czech", 3, 100);

      expect(mockDb.getEntriesForLanguages).toHaveBeenCalledWith(
        "English",
        "Czech",
        3,
        100,
      );
    });

    it("handles thrown errors", async () => {
      mockDb.getEntriesForLanguages.mockRejectedValue(new Error("DB error"));

      const result = await service.getEntriesForLanguages("English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("getSearchSuggestions", () => {
    it("returns suggestions", async () => {
      mockDb.getSearchSuggestions.mockResolvedValue(["hello", "help", "hero"]);

      const result = await service.getSearchSuggestions("hel");

      expect(result.success).toBe(true);
      expect(result.suggestions).toEqual(["hello", "help", "hero"]);
      expect(mockDb.getSearchSuggestions).toHaveBeenCalledWith(
        "hel",
        undefined,
        undefined,
        10,
      );
    });

    it("passes language filters and limit", async () => {
      mockDb.getSearchSuggestions.mockResolvedValue([]);

      await service.getSearchSuggestions("hel", "English", "Czech", 5);

      expect(mockDb.getSearchSuggestions).toHaveBeenCalledWith(
        "hel",
        "English",
        "Czech",
        5,
      );
    });

    it("handles thrown errors", async () => {
      mockDb.getSearchSuggestions.mockRejectedValue(new Error("DB error"));

      const result = await service.getSearchSuggestions("hel");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("getSimilarEntries", () => {
    it("returns similar entries", async () => {
      const entries = [makeSampleEntry({ headword: "hell" })];
      mockDb.getSimilarEntries.mockResolvedValue(entries);

      const result = await service.getSimilarEntries("hello");

      expect(result.success).toBe(true);
      expect(result.entries).toBe(entries);
      expect(mockDb.getSimilarEntries).toHaveBeenCalledWith(
        "hello",
        undefined,
        undefined,
        5,
      );
    });

    it("handles thrown errors", async () => {
      mockDb.getSimilarEntries.mockRejectedValue(new Error("DB error"));

      const result = await service.getSimilarEntries("hello");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("getAllLanguages", () => {
    it("returns all languages", async () => {
      const languages = {
        sourceLanguages: ["English"],
        targetLanguages: ["Czech"],
        definitionLanguages: ["English"],
      };
      mockDb.getAllLanguages.mockResolvedValue(languages);

      const result = await service.getAllLanguages();

      expect(result.success).toBe(true);
      expect(result.languages).toBe(languages);
    });

    it("handles thrown errors", async () => {
      mockDb.getAllLanguages.mockRejectedValue(new Error("DB error"));

      const result = await service.getAllLanguages();

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("getRecentActivity", () => {
    it("returns recent entries", async () => {
      const entries = [makeSampleEntry()];
      mockDb.getRecentEntries.mockResolvedValue(entries);

      const result = await service.getRecentActivity("English", "Czech");

      expect(result.success).toBe(true);
      expect(result.entries).toBe(entries);
      expect(mockDb.getRecentEntries).toHaveBeenCalledWith(
        "English",
        "Czech",
        10,
      );
    });

    it("passes custom limit", async () => {
      mockDb.getRecentEntries.mockResolvedValue([]);

      await service.getRecentActivity("English", "Czech", 5);

      expect(mockDb.getRecentEntries).toHaveBeenCalledWith(
        "English",
        "Czech",
        5,
      );
    });

    it("handles thrown errors", async () => {
      mockDb.getRecentEntries.mockRejectedValue(new Error("DB error"));

      const result = await service.getRecentActivity("English", "Czech");

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  describe("performMaintenance", () => {
    it("runs maintenance and clears cache", async () => {
      mockDb.runMaintenance.mockResolvedValue(undefined);
      mockDb.clearExpiredLemmaCache.mockResolvedValue(undefined);

      const result = await service.performMaintenance();

      expect(result.success).toBe(true);
      expect(mockDb.runMaintenance).toHaveBeenCalled();
      expect(mockDb.clearExpiredLemmaCache).toHaveBeenCalled();
    });

    it("handles thrown errors", async () => {
      mockDb.runMaintenance.mockRejectedValue(new Error("Maintenance failed"));

      const result = await service.performMaintenance();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Maintenance failed");
    });
  });

  describe("runHealthCheck", () => {
    it("returns health report", async () => {
      const report = { healthy: true, issues: [] };
      mockDb.getDatabaseHealthReport.mockResolvedValue(report);

      const result = await service.runHealthCheck();

      expect(result.success).toBe(true);
      expect(result.report).toBe(report);
    });

    it("handles thrown errors", async () => {
      mockDb.getDatabaseHealthReport.mockRejectedValue(
        new Error("Health check failed"),
      );

      const result = await service.runHealthCheck();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Health check failed");
    });
  });

  describe("initializeDatabase", () => {
    it("runs migrations when needed", async () => {
      mockDb.checkMigrationNeeded.mockResolvedValue(true);
      mockDb.runMigrations.mockResolvedValue(undefined);

      const result = await service.initializeDatabase();

      expect(result.success).toBe(true);
      expect(mockDb.runMigrations).toHaveBeenCalled();
    });

    it("skips migrations when not needed", async () => {
      mockDb.checkMigrationNeeded.mockResolvedValue(false);

      const result = await service.initializeDatabase();

      expect(result.success).toBe(true);
      expect(mockDb.runMigrations).not.toHaveBeenCalled();
    });

    it("handles thrown errors", async () => {
      mockDb.checkMigrationNeeded.mockRejectedValue(
        new Error("Migration check failed"),
      );

      const result = await service.initializeDatabase();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Migration check failed");
    });
  });

  describe("bulkCreateEntries", () => {
    it("creates entries sequentially", async () => {
      mockAi.getLemma.mockResolvedValue({ lemma: "hello", cached: false });
      mockDb.getEntryByHeadword.mockResolvedValue(null);
      mockAi.generateEntry.mockResolvedValue(makeSampleEntry());
      mockDb.addEntry.mockResolvedValue(1);

      const result = await service.bulkCreateEntries(
        ["hello", "world"],
        "English",
        "Czech",
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it("handles mixed success/failure", async () => {
      mockAi.getLemma
        .mockResolvedValueOnce({ lemma: "hello", cached: false })
        .mockRejectedValueOnce(new Error("AI error"));
      mockDb.getEntryByHeadword.mockResolvedValue(null);
      mockAi.generateEntry.mockResolvedValue(makeSampleEntry());
      mockDb.addEntry.mockResolvedValue(1);

      const result = await service.bulkCreateEntries(
        ["hello", "fail"],
        "English",
        "Czech",
      );

      expect(result.success).toBe(true);
      expect(result.results![0].success).toBe(true);
      expect(result.results![1].success).toBe(false);
    });
  });

  describe("exportEntries", () => {
    it("returns all entries", async () => {
      const entries = [makeSampleEntry()];
      mockDb.getEntriesForLanguages.mockResolvedValue({ entries, total: 1 });

      const result = await service.exportEntries("English", "Czech");

      expect(result.success).toBe(true);
      expect(result.data).toBe(entries);
    });

    it("handles thrown errors", async () => {
      mockDb.getEntriesForLanguages.mockRejectedValue(
        new Error("Export failed"),
      );

      const result = await service.exportEntries();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Export failed");
    });
  });

  describe("importEntries", () => {
    it("imports entries sequentially", async () => {
      mockDb.addEntry.mockResolvedValue(1);

      const result = await service.importEntries([
        makeSampleEntry(),
        makeSampleEntry({ headword: "world" }),
      ]);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results![0].success).toBe(true);
      expect(result.results![1].success).toBe(true);
    });

    it("handles per-entry failures", async () => {
      mockDb.addEntry
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error("Duplicate"));

      const result = await service.importEntries([
        makeSampleEntry(),
        makeSampleEntry({ headword: "dup" }),
      ]);

      expect(result.success).toBe(true);
      expect(result.results![0].success).toBe(true);
      expect(result.results![1].success).toBe(false);
      expect(result.results![1].error).toBe("Duplicate");
    });

    it("reports failure when addEntry returns null", async () => {
      mockDb.addEntry.mockResolvedValue(null);

      const result = await service.importEntries([makeSampleEntry()]);

      expect(result.results![0].success).toBe(false);
      expect(result.results![0].error).toContain("Failed to save");
    });
  });

  describe("per-request AI provider config", () => {
    it("creates a provider instance when providerConfig is passed to createEntry", async () => {
      const sampleEntry = makeSampleEntry();
      (
        AIManager.createProviderInstance as ReturnType<typeof vi.fn>
      ).mockReturnValue(AIManager.getInstance());
      (mockDb.getEntryByHeadword as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      (
        AIManager.getInstance().getLemma as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ lemma: "test", cached: false });
      (
        AIManager.getInstance().generateEntry as ReturnType<typeof vi.fn>
      ).mockResolvedValue(sampleEntry);
      (mockDb.addEntry as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await service.createEntry("test", "English", "Czech", undefined, {
        providerType: "chatgpt",
        apiKey: "sk-test",
        model: "gpt-4o",
      });

      expect(AIManager.createProviderInstance).toHaveBeenCalledWith({
        providerType: "chatgpt",
        apiKey: "sk-test",
        model: "gpt-4o",
      });
    });
  });
});
