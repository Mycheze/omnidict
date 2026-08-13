import { describe, it, expect, beforeEach } from "vitest";
import { useAnkiStore } from "./ankiStore";

describe("ankiStore", () => {
  beforeEach(() => {
    useAnkiStore.getState().resetSettings();
    useAnkiStore.setState({
      reachable: false,
      availableDecks: [],
      availableNoteTypes: [],
      connectionStatus: { connected: false },
      isConnecting: false,
      isExporting: false,
      lastExportTime: null,
    });
  });

  describe("defaults", () => {
    it("starts disabled and unreachable", () => {
      const state = useAnkiStore.getState();
      expect(state.enabled).toBe(false);
      expect(state.reachable).toBe(false);
    });

    it("has default tags", () => {
      expect(useAnkiStore.getState().tags).toEqual(["omnidict"]);
    });
  });

  describe("basic setters", () => {
    it("setEnabled", () => {
      useAnkiStore.getState().setEnabled(true);
      expect(useAnkiStore.getState().enabled).toBe(true);
    });

    it("setReachable", () => {
      useAnkiStore.getState().setReachable(true);
      expect(useAnkiStore.getState().reachable).toBe(true);
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
    it("resets user settings to defaults", () => {
      useAnkiStore.getState().setEnabled(true);
      useAnkiStore.getState().setDeck("MyDeck");
      useAnkiStore.getState().setTags(["custom"]);

      useAnkiStore.getState().resetSettings();

      const state = useAnkiStore.getState();
      expect(state.enabled).toBe(false);
      expect(state.deck).toBe("");
      expect(state.tags).toEqual(["omnidict"]);
    });
  });

  describe("persistence", () => {
    it("persists only user settings (partialize)", () => {
      const { partialize } = useAnkiStore.persist.getOptions();
      expect(partialize).toBeDefined();

      const persisted = partialize!(useAnkiStore.getState());

      expect(Object.keys(persisted).sort()).toEqual([
        "deck",
        "enabled",
        "fieldMappings",
        "noteType",
        "tags",
      ]);
    });

    it("uses persist version 2", () => {
      expect(useAnkiStore.persist.getOptions().version).toBe(2);
    });

    it("migrates a v1 blob: keeps settings, drops removed keys", async () => {
      const { migrate } = useAnkiStore.persist.getOptions();
      expect(migrate).toBeDefined();

      const v1Blob = {
        enabled: true,
        connected: true,
        deck: "Czech Vocab",
        noteType: "Basic",
        fieldMappings: [{ ankiField: "Front", deepDictField: "headword" }],
        tags: ["omnidict", "czech"],
        ankiConnectUrl: "/api/anki",
        availableDecks: [{ name: "Czech Vocab" }],
        connectionStatus: { connected: true },
        lastExportTime: 12345,
      };

      const migrated = await migrate!(v1Blob, 1);

      expect(migrated).toEqual({
        enabled: true,
        deck: "Czech Vocab",
        noteType: "Basic",
        fieldMappings: [{ ankiField: "Front", deepDictField: "headword" }],
        tags: ["omnidict", "czech"],
      });
    });

    it("migrates a corrupt/empty blob to safe defaults", async () => {
      const { migrate } = useAnkiStore.persist.getOptions();

      const migrated = await migrate!(null, 1);

      expect(migrated).toEqual({
        enabled: false,
        deck: "",
        noteType: "",
        fieldMappings: [],
        tags: ["omnidict"],
      });
    });
  });
});
