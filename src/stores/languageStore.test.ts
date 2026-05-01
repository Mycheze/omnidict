import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLanguageStore } from "./languageStore";
import type { ManagedLanguage } from "@/lib/types";

function makeLanguage(overrides?: Partial<ManagedLanguage>): ManagedLanguage {
  return {
    standardizedName: "English",
    displayName: "English",
    visible: true,
    isCustom: false,
    ...overrides,
  };
}

describe("languageStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useLanguageStore.setState({
      sourceLanguages: [],
      targetLanguages: [],
      lastSyncTime: null,
      isLoading: false,
      error: null,
    });
  });

  describe("addLanguage", () => {
    it("adds source language", () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());

      expect(useLanguageStore.getState().sourceLanguages).toHaveLength(1);
      expect(
        useLanguageStore.getState().sourceLanguages[0].standardizedName,
      ).toBe("English");
    });

    it("adds target language", () => {
      useLanguageStore
        .getState()
        .addLanguage(
          "target",
          makeLanguage({ standardizedName: "Czech", displayName: "Czech" }),
        );

      expect(useLanguageStore.getState().targetLanguages).toHaveLength(1);
      expect(
        useLanguageStore.getState().targetLanguages[0].standardizedName,
      ).toBe("Czech");
    });

    it("rejects duplicate (case-insensitive)", () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ standardizedName: "english" }));

      expect(useLanguageStore.getState().sourceLanguages).toHaveLength(1);
      expect(useLanguageStore.getState().error).toContain("already exists");
    });

    it("clears error on successful add", () => {
      useLanguageStore.setState({ error: "previous error" });
      useLanguageStore.getState().addLanguage("source", makeLanguage());

      expect(useLanguageStore.getState().error).toBeNull();
    });
  });

  describe("updateLanguage", () => {
    it("updates matching language", () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());

      useLanguageStore
        .getState()
        .updateLanguage("source", "English", { displayName: "ENG" });

      expect(useLanguageStore.getState().sourceLanguages[0].displayName).toBe(
        "ENG",
      );
    });

    it("does not affect other languages", () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());
      useLanguageStore
        .getState()
        .addLanguage(
          "source",
          makeLanguage({ standardizedName: "Czech", displayName: "Czech" }),
        );

      useLanguageStore
        .getState()
        .updateLanguage("source", "English", { visible: false });

      expect(useLanguageStore.getState().sourceLanguages[1].visible).toBe(true);
    });
  });

  describe("toggleLanguageVisibility", () => {
    it("toggles visible to hidden", () => {
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ visible: true }));

      useLanguageStore.getState().toggleLanguageVisibility("source", "English");

      expect(useLanguageStore.getState().sourceLanguages[0].visible).toBe(
        false,
      );
    });

    it("toggles hidden to visible", () => {
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ visible: false }));

      useLanguageStore.getState().toggleLanguageVisibility("source", "English");

      expect(useLanguageStore.getState().sourceLanguages[0].visible).toBe(true);
    });

    it("does nothing for non-existent language", () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());

      useLanguageStore
        .getState()
        .toggleLanguageVisibility("source", "NonExistent");

      expect(useLanguageStore.getState().sourceLanguages[0].visible).toBe(true);
    });
  });

  describe("removeCustomLanguage", () => {
    it("removes custom language", () => {
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ isCustom: true }));

      useLanguageStore.getState().removeCustomLanguage("source", "English");

      expect(useLanguageStore.getState().sourceLanguages).toHaveLength(0);
    });

    it("does not remove non-custom language", () => {
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ isCustom: false }));

      useLanguageStore.getState().removeCustomLanguage("source", "English");

      expect(useLanguageStore.getState().sourceLanguages).toHaveLength(1);
    });
  });

  describe("getVisibleLanguages", () => {
    it("returns only visible source languages", () => {
      useLanguageStore
        .getState()
        .addLanguage("source", makeLanguage({ visible: true }));
      useLanguageStore.getState().addLanguage(
        "source",
        makeLanguage({
          standardizedName: "Czech",
          displayName: "Czech",
          visible: false,
        }),
      );

      const visible = useLanguageStore.getState().getVisibleSourceLanguages();

      expect(visible).toHaveLength(1);
      expect(visible[0].standardizedName).toBe("English");
    });

    it("returns only visible target languages", () => {
      useLanguageStore.getState().addLanguage(
        "target",
        makeLanguage({
          standardizedName: "Czech",
          displayName: "Czech",
          visible: true,
        }),
      );
      useLanguageStore.getState().addLanguage(
        "target",
        makeLanguage({
          standardizedName: "German",
          displayName: "German",
          visible: false,
        }),
      );

      const visible = useLanguageStore.getState().getVisibleTargetLanguages();

      expect(visible).toHaveLength(1);
      expect(visible[0].standardizedName).toBe("Czech");
    });
  });

  describe("setLoading / setError", () => {
    it("sets loading state", () => {
      useLanguageStore.getState().setLoading(true);
      expect(useLanguageStore.getState().isLoading).toBe(true);
    });

    it("sets error state", () => {
      useLanguageStore.getState().setError("Something went wrong");
      expect(useLanguageStore.getState().error).toBe("Something went wrong");
    });
  });

  describe("syncWithDatabase", () => {
    it("merges new languages from database", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              sourceLanguages: ["English", "Spanish"],
              targetLanguages: ["Czech"],
            },
          }),
        ),
      );

      await useLanguageStore.getState().syncWithDatabase();

      const state = useLanguageStore.getState();
      expect(state.sourceLanguages).toHaveLength(2);
      expect(state.targetLanguages).toHaveLength(1);
      expect(state.lastSyncTime).toBeGreaterThan(0);
      expect(state.isLoading).toBe(false);
    });

    it("does not duplicate existing languages", async () => {
      useLanguageStore.getState().addLanguage("source", makeLanguage());

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              sourceLanguages: ["English"],
              targetLanguages: [],
            },
          }),
        ),
      );

      await useLanguageStore.getState().syncWithDatabase();

      expect(useLanguageStore.getState().sourceLanguages).toHaveLength(1);
    });

    it("sets error on failed response", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "DB down" })),
      );

      await useLanguageStore.getState().syncWithDatabase();

      expect(useLanguageStore.getState().error).toBe("DB down");
      expect(useLanguageStore.getState().isLoading).toBe(false);
    });

    it("sets error on fetch failure", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network error"),
      );

      await useLanguageStore.getState().syncWithDatabase();

      expect(useLanguageStore.getState().error).toBe("Network error");
      expect(useLanguageStore.getState().isLoading).toBe(false);
    });
  });

  describe("initializeFromDatabase", () => {
    it("syncs when lastSyncTime is null", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { sourceLanguages: ["English"], targetLanguages: ["Czech"] },
          }),
        ),
      );

      await useLanguageStore.getState().initializeFromDatabase();

      expect(useLanguageStore.getState().lastSyncTime).not.toBeNull();
    });

    it("skips sync when already synced", async () => {
      useLanguageStore.setState({ lastSyncTime: Date.now() });
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await useLanguageStore.getState().initializeFromDatabase();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
