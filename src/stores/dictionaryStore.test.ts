import { describe, it, expect, beforeEach } from "vitest";
import { useDictionaryStore } from "./dictionaryStore";
import { makeSampleEntry } from "@/test/helpers/fixtures";

function makeMockEntry(headword: string) {
  return makeSampleEntry({ headword, part_of_speech: "noun" });
}

const initialState = {
  entries: [],
  totalEntries: 0,
  currentEntry: null,
  recentEntries: [],
  searchLoading: false,
  searchResults: {
    entries: [],
    total: 0,
    page: 1,
    pageSize: 50,
    paginationIndex: [],
  },
  context: {
    contextSentence: "",
    selectedWord: "",
    isContextMode: false,
    selectedWordRange: undefined,
    isContextExpanded: false,
  },
  loading: false,
  error: null,
};

describe("dictionaryStore", () => {
  beforeEach(() => {
    useDictionaryStore.setState(initialState);
  });

  describe("addToRecentEntries", () => {
    it("adds entry when isNewOrSearched is true", () => {
      useDictionaryStore
        .getState()
        .addToRecentEntries(makeMockEntry("hello"), true);
      expect(useDictionaryStore.getState().recentEntries).toHaveLength(1);
      expect(useDictionaryStore.getState().recentEntries[0].headword).toBe(
        "hello",
      );
    });

    it("does not add when isNewOrSearched is false", () => {
      useDictionaryStore
        .getState()
        .addToRecentEntries(makeMockEntry("hello"), false);
      expect(useDictionaryStore.getState().recentEntries).toHaveLength(0);
    });

    it("does not add when isNewOrSearched is omitted (default false)", () => {
      useDictionaryStore.getState().addToRecentEntries(makeMockEntry("hello"));
      expect(useDictionaryStore.getState().recentEntries).toHaveLength(0);
    });

    it("deduplicates by headword", () => {
      const store = useDictionaryStore.getState();
      store.addToRecentEntries(makeMockEntry("hello"), true);
      store.addToRecentEntries(makeMockEntry("hello"), true);
      expect(useDictionaryStore.getState().recentEntries).toHaveLength(1);
    });

    it("puts newest entry first", () => {
      const store = useDictionaryStore.getState();
      store.addToRecentEntries(makeMockEntry("first"), true);
      store.addToRecentEntries(makeMockEntry("second"), true);
      const recent = useDictionaryStore.getState().recentEntries;
      expect(recent[0].headword).toBe("second");
      expect(recent[1].headword).toBe("first");
    });

    it("caps at 5 entries", () => {
      const store = useDictionaryStore.getState();
      for (let i = 0; i < 7; i++) {
        store.addToRecentEntries(makeMockEntry(`word${i}`), true);
      }
      expect(useDictionaryStore.getState().recentEntries).toHaveLength(5);
    });
  });

  describe("updateEntry", () => {
    it("updates entry in entries, recentEntries, and currentEntry", () => {
      const original = makeMockEntry("hello");
      const updated = { ...original, part_of_speech: "verb" };

      useDictionaryStore.setState({
        entries: [original],
        recentEntries: [original],
        currentEntry: original,
      });

      useDictionaryStore.getState().updateEntry("hello", updated);

      const state = useDictionaryStore.getState();
      expect(state.entries[0].part_of_speech).toBe("verb");
      expect(state.recentEntries[0].part_of_speech).toBe("verb");
      expect(state.currentEntry!.part_of_speech).toBe("verb");
    });

    it("does not affect other entries", () => {
      const entry1 = makeMockEntry("hello");
      const entry2 = makeMockEntry("world");

      useDictionaryStore.setState({ entries: [entry1, entry2] });
      useDictionaryStore
        .getState()
        .updateEntry("hello", { ...entry1, part_of_speech: "verb" });

      expect(useDictionaryStore.getState().entries[1].part_of_speech).toBe(
        "noun",
      );
    });
  });

  describe("removeEntry", () => {
    it("removes from entries, recentEntries, and clears currentEntry", () => {
      const entry = makeMockEntry("hello");
      useDictionaryStore.setState({
        entries: [entry],
        recentEntries: [entry],
        currentEntry: entry,
      });

      useDictionaryStore.getState().removeEntry("hello");

      const state = useDictionaryStore.getState();
      expect(state.entries).toHaveLength(0);
      expect(state.recentEntries).toHaveLength(0);
      expect(state.currentEntry).toBeNull();
    });

    it("does not clear currentEntry if different headword", () => {
      const entry1 = makeMockEntry("hello");
      const entry2 = makeMockEntry("world");
      useDictionaryStore.setState({
        entries: [entry1, entry2],
        currentEntry: entry2,
      });

      useDictionaryStore.getState().removeEntry("hello");

      expect(useDictionaryStore.getState().currentEntry!.headword).toBe(
        "world",
      );
      expect(useDictionaryStore.getState().entries).toHaveLength(1);
    });
  });

  describe("selectWordFromContext", () => {
    it("sets selected word and range", () => {
      useDictionaryStore.getState().selectWordFromContext("hello", 0, 5);
      const ctx = useDictionaryStore.getState().context;
      expect(ctx.selectedWord).toBe("hello");
      expect(ctx.selectedWordRange).toEqual({ start: 0, end: 5 });
    });
  });

  describe("clearContext", () => {
    it("resets context but preserves isContextExpanded", () => {
      useDictionaryStore.setState({
        context: {
          contextSentence: "some text",
          selectedWord: "some",
          isContextMode: true,
          selectedWordRange: { start: 0, end: 4 },
          isContextExpanded: true,
        },
      });

      useDictionaryStore.getState().clearContext();

      const ctx = useDictionaryStore.getState().context;
      expect(ctx.contextSentence).toBe("");
      expect(ctx.selectedWord).toBe("");
      expect(ctx.isContextMode).toBe(false);
      expect(ctx.selectedWordRange).toBeUndefined();
      expect(ctx.isContextExpanded).toBe(true); // preserved
    });
  });

  describe("addEntry", () => {
    it("prepends entry and sets as currentEntry", () => {
      const existing = makeMockEntry("world");
      useDictionaryStore.setState({ entries: [existing] });

      const newEntry = makeMockEntry("hello");
      useDictionaryStore.getState().addEntry(newEntry);

      const state = useDictionaryStore.getState();
      expect(state.entries).toHaveLength(2);
      expect(state.entries[0].headword).toBe("hello");
      expect(state.currentEntry!.headword).toBe("hello");
    });
  });

  describe("basic setters", () => {
    it("setEntries", () => {
      const entries = [makeMockEntry("hello")];
      useDictionaryStore.getState().setEntries(entries);
      expect(useDictionaryStore.getState().entries).toBe(entries);
    });

    it("setTotalEntries", () => {
      useDictionaryStore.getState().setTotalEntries(42);
      expect(useDictionaryStore.getState().totalEntries).toBe(42);
    });

    it("setCurrentEntry", () => {
      const entry = makeMockEntry("hello");
      useDictionaryStore.getState().setCurrentEntry(entry);
      expect(useDictionaryStore.getState().currentEntry).toBe(entry);
    });

    it("setCurrentEntry to null", () => {
      useDictionaryStore.setState({ currentEntry: makeMockEntry("hello") });
      useDictionaryStore.getState().setCurrentEntry(null);
      expect(useDictionaryStore.getState().currentEntry).toBeNull();
    });

    it("setSearchLoading", () => {
      useDictionaryStore.getState().setSearchLoading(true);
      expect(useDictionaryStore.getState().searchLoading).toBe(true);
    });

    it("setSearchResults", () => {
      const results = {
        entries: [makeMockEntry("hello")],
        total: 1,
        page: 2,
        pageSize: 25,
      };
      useDictionaryStore.getState().setSearchResults(results);
      expect(useDictionaryStore.getState().searchResults).toBe(results);
    });

    it("setLoading", () => {
      useDictionaryStore.getState().setLoading(true);
      expect(useDictionaryStore.getState().loading).toBe(true);
    });

    it("setError", () => {
      useDictionaryStore.getState().setError("Something went wrong");
      expect(useDictionaryStore.getState().error).toBe("Something went wrong");
    });

    it("setError to null clears error", () => {
      useDictionaryStore.setState({ error: "old error" });
      useDictionaryStore.getState().setError(null);
      expect(useDictionaryStore.getState().error).toBeNull();
    });
  });

  describe("context actions", () => {
    it("setContextSentence enables context mode", () => {
      useDictionaryStore
        .getState()
        .setContextSentence("The cat sat on the mat.");

      const ctx = useDictionaryStore.getState().context;
      expect(ctx.contextSentence).toBe("The cat sat on the mat.");
      expect(ctx.isContextMode).toBe(true);
      expect(ctx.isContextExpanded).toBe(true);
    });

    it("setContextSentence disables context mode when empty", () => {
      useDictionaryStore.getState().setContextSentence("text");
      useDictionaryStore.getState().setContextSentence("");

      const ctx = useDictionaryStore.getState().context;
      expect(ctx.isContextMode).toBe(false);
    });

    it("setContextSentence preserves isContextExpanded when set to empty", () => {
      useDictionaryStore.getState().setContextSentence("text");
      useDictionaryStore.getState().setContextSentence("");

      expect(useDictionaryStore.getState().context.isContextExpanded).toBe(
        true,
      );
    });

    it("setSelectedWord sets word and optional range", () => {
      useDictionaryStore
        .getState()
        .setSelectedWord("cat", { start: 4, end: 7 });

      const ctx = useDictionaryStore.getState().context;
      expect(ctx.selectedWord).toBe("cat");
      expect(ctx.selectedWordRange).toEqual({ start: 4, end: 7 });
    });

    it("setSelectedWord without range", () => {
      useDictionaryStore.getState().setSelectedWord("cat");

      const ctx = useDictionaryStore.getState().context;
      expect(ctx.selectedWord).toBe("cat");
      expect(ctx.selectedWordRange).toBeUndefined();
    });

    it("setContextMode", () => {
      useDictionaryStore.getState().setContextMode(true);
      expect(useDictionaryStore.getState().context.isContextMode).toBe(true);
    });

    it("setContextExpanded", () => {
      useDictionaryStore.getState().setContextExpanded(true);
      expect(useDictionaryStore.getState().context.isContextExpanded).toBe(
        true,
      );
    });
  });
});
