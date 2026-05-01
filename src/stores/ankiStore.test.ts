import { describe, it, expect, beforeEach } from "vitest";
import { useAnkiStore } from "./ankiStore";

describe("ankiStore", () => {
  beforeEach(() => {
    useAnkiStore.getState().resetSettings();
    useAnkiStore.setState({
      availableDecks: [],
      availableNoteTypes: [],
      connectionStatus: { connected: false },
      isConnecting: false,
      isExporting: false,
      lastExportTime: null,
    });
  });

  describe("defaults", () => {
    it("starts disabled and disconnected", () => {
      const state = useAnkiStore.getState();
      expect(state.enabled).toBe(false);
      expect(state.connected).toBe(false);
    });

    it("has default tags", () => {
      expect(useAnkiStore.getState().tags).toEqual(["omnidict"]);
    });

    it("uses proxy URL by default", () => {
      expect(useAnkiStore.getState().ankiConnectUrl).toBe("/api/anki");
    });
  });

  describe("basic setters", () => {
    it("setEnabled", () => {
      useAnkiStore.getState().setEnabled(true);
      expect(useAnkiStore.getState().enabled).toBe(true);
    });

    it("setConnected", () => {
      useAnkiStore.getState().setConnected(true);
      expect(useAnkiStore.getState().connected).toBe(true);
    });

    it("setDeck", () => {
      useAnkiStore.getState().setDeck("Default");
      expect(useAnkiStore.getState().deck).toBe("Default");
    });

    it("setTags", () => {
      useAnkiStore.getState().setTags(["lang", "vocab"]);
      expect(useAnkiStore.getState().tags).toEqual(["lang", "vocab"]);
    });

    it("setAvailableDecks", () => {
      useAnkiStore
        .getState()
        .setAvailableDecks([{ name: "Default" }, { name: "Vocab" }]);
      expect(useAnkiStore.getState().availableDecks).toHaveLength(2);
    });

    it("setAvailableNoteTypes", () => {
      useAnkiStore
        .getState()
        .setAvailableNoteTypes([{ name: "Basic", fields: ["Front", "Back"] }]);
      expect(useAnkiStore.getState().availableNoteTypes).toHaveLength(1);
    });

    it("setConnectionStatus", () => {
      useAnkiStore
        .getState()
        .setConnectionStatus({ connected: true, version: "6" });
      expect(useAnkiStore.getState().connectionStatus.connected).toBe(true);
      expect(useAnkiStore.getState().connectionStatus.version).toBe("6");
    });

    it("setIsConnecting", () => {
      useAnkiStore.getState().setIsConnecting(true);
      expect(useAnkiStore.getState().isConnecting).toBe(true);
    });

    it("setIsExporting", () => {
      useAnkiStore.getState().setIsExporting(true);
      expect(useAnkiStore.getState().isExporting).toBe(true);
    });

    it("setLastExportTime", () => {
      const now = Date.now();
      useAnkiStore.getState().setLastExportTime(now);
      expect(useAnkiStore.getState().lastExportTime).toBe(now);
    });

    it("setFieldMappings", () => {
      useAnkiStore
        .getState()
        .setFieldMappings([{ ankiField: "Front", deepDictField: "headword" }]);
      expect(useAnkiStore.getState().fieldMappings).toHaveLength(1);
    });
  });

  describe("setNoteType", () => {
    it("sets note type and auto-generates field mappings", () => {
      useAnkiStore
        .getState()
        .setAvailableNoteTypes([{ name: "Basic", fields: ["Front", "Back"] }]);

      useAnkiStore.getState().setNoteType("Basic");

      const state = useAnkiStore.getState();
      expect(state.noteType).toBe("Basic");
      expect(state.fieldMappings).toHaveLength(2);
      expect(state.fieldMappings[0]).toEqual({
        ankiField: "Front",
        deepDictField: "none",
      });
      expect(state.fieldMappings[1]).toEqual({
        ankiField: "Back",
        deepDictField: "none",
      });
    });

    it("does not generate mappings if note type not found", () => {
      useAnkiStore
        .getState()
        .setFieldMappings([{ ankiField: "X", deepDictField: "headword" }]);

      useAnkiStore.getState().setNoteType("NonExistent");

      expect(useAnkiStore.getState().noteType).toBe("NonExistent");
      expect(useAnkiStore.getState().fieldMappings).toHaveLength(1);
    });
  });

  describe("resetSettings", () => {
    it("resets to defaults", () => {
      useAnkiStore.getState().setEnabled(true);
      useAnkiStore.getState().setConnected(true);
      useAnkiStore.getState().setDeck("MyDeck");
      useAnkiStore.getState().setTags(["custom"]);

      useAnkiStore.getState().resetSettings();

      const state = useAnkiStore.getState();
      expect(state.enabled).toBe(false);
      expect(state.connected).toBe(false);
      expect(state.deck).toBe("");
      expect(state.tags).toEqual(["omnidict"]);
    });
  });
});
