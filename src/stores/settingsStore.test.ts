import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "./settingsStore";

describe("settingsStore", () => {
  beforeEach(() => {
    useSettingsStore.getState().resetToDefaults();
  });

  describe("defaults", () => {
    it("has correct default languages", () => {
      const state = useSettingsStore.getState();
      expect(state.languages.sourceLanguage).toBe("English");
      expect(state.languages.targetLanguage).toBe("Czech");
    });

    it("has correct default preferences", () => {
      const state = useSettingsStore.getState();
      expect(state.preferences.darkMode).toBe(false);
    });
  });

  describe("updateLanguages", () => {
    it("merges partial language update", () => {
      useSettingsStore
        .getState()
        .updateLanguages({ sourceLanguage: "Spanish" });

      const state = useSettingsStore.getState();
      expect(state.languages.sourceLanguage).toBe("Spanish");
      expect(state.languages.targetLanguage).toBe("Czech");
    });

    it("updates both languages", () => {
      useSettingsStore.getState().updateLanguages({
        sourceLanguage: "German",
        targetLanguage: "French",
      });

      const state = useSettingsStore.getState();
      expect(state.languages.sourceLanguage).toBe("German");
      expect(state.languages.targetLanguage).toBe("French");
    });
  });

  describe("updatePreferences", () => {
    it("toggles dark mode", () => {
      useSettingsStore.getState().updatePreferences({ darkMode: true });
      expect(useSettingsStore.getState().preferences.darkMode).toBe(true);
    });
  });

  describe("resetToDefaults", () => {
    it("resets all settings", () => {
      useSettingsStore
        .getState()
        .updateLanguages({ sourceLanguage: "Japanese" });
      useSettingsStore.getState().updatePreferences({ darkMode: true });

      useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.languages.sourceLanguage).toBe("English");
      expect(state.preferences.darkMode).toBe(false);
    });
  });

  describe("migrate", () => {
    const migrate = useSettingsStore.persist.getOptions().migrate!;

    it("resets anything below v4 to defaults", () => {
      const result = migrate(
        { languages: { sourceLanguage: "Japanese" } },
        3,
      ) as { languages: { sourceLanguage: string } };
      expect(result.languages.sourceLanguage).toBe("English");
    });

    it("v4 to v5 keeps languages and darkMode, drops dead fields", () => {
      const result = migrate(
        {
          languages: { sourceLanguage: "German", targetLanguage: "French" },
          preferences: {
            darkMode: true,
            autoSave: false,
            showTranslations: false,
          },
          ai: { provider: "deepseek", temperature: 0.7 },
        },
        4,
      ) as Record<string, unknown>;

      expect(result).toEqual({
        languages: { sourceLanguage: "German", targetLanguage: "French" },
        preferences: { darkMode: true },
      });
    });

    it("handles corrupt persisted state", () => {
      const result = migrate(null, 4) as {
        languages: { sourceLanguage: string };
      };
      expect(result.languages.sourceLanguage).toBe("English");
    });
  });
});
