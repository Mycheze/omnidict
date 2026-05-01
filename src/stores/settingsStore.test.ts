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
      expect(state.preferences.autoSave).toBe(true);
      expect(state.preferences.showTranslations).toBe(true);
      expect(state.preferences.enableClipboardMonitoring).toBe(false);
      expect(state.preferences.darkMode).toBe(false);
    });

    it("has correct default AI settings", () => {
      const state = useSettingsStore.getState();
      expect(state.ai.provider).toBe("deepseek");
      expect(state.ai.temperature).toBe(0.7);
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
    it("merges partial preference update", () => {
      useSettingsStore.getState().updatePreferences({ darkMode: true });

      const state = useSettingsStore.getState();
      expect(state.preferences.darkMode).toBe(true);
      expect(state.preferences.autoSave).toBe(true);
    });

    it("updates multiple preferences", () => {
      useSettingsStore.getState().updatePreferences({
        autoSave: false,
        enableClipboardMonitoring: true,
      });

      const state = useSettingsStore.getState();
      expect(state.preferences.autoSave).toBe(false);
      expect(state.preferences.enableClipboardMonitoring).toBe(true);
    });
  });

  describe("updateAI", () => {
    it("merges partial AI update", () => {
      useSettingsStore.getState().updateAI({ temperature: 0.5 });

      const state = useSettingsStore.getState();
      expect(state.ai.temperature).toBe(0.5);
      expect(state.ai.provider).toBe("deepseek");
    });

    it("updates provider", () => {
      useSettingsStore.getState().updateAI({ provider: "openai" });

      expect(useSettingsStore.getState().ai.provider).toBe("openai");
    });
  });

  describe("resetToDefaults", () => {
    it("resets all settings", () => {
      useSettingsStore
        .getState()
        .updateLanguages({ sourceLanguage: "Japanese" });
      useSettingsStore.getState().updatePreferences({ darkMode: true });
      useSettingsStore.getState().updateAI({ temperature: 0.1 });

      useSettingsStore.getState().resetToDefaults();

      const state = useSettingsStore.getState();
      expect(state.languages.sourceLanguage).toBe("English");
      expect(state.preferences.darkMode).toBe(false);
      expect(state.ai.temperature).toBe(0.7);
    });
  });
});
