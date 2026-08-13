import { describe, it, expect, beforeEach } from "vitest";
import {
  collectSyncedSettings,
  applySyncedSettings,
  SyncedSettingsV1,
} from "./settingsSync";
import { useAIStore } from "@/stores/aiStore";
import { useAnkiStore } from "@/stores/ankiStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useSettingsStore } from "@/stores/settingsStore";

const AI_SECRET = "sk-super-secret-ai-key-12345";
const ELEVENLABS_SECRET = "el-super-secret-media-key-67890";
const REPLICATE_SECRET = "r8-super-secret-replicate-key";

function resetAllStores(): void {
  useSettingsStore.getState().resetToDefaults();
  useAIStore.getState().resetSettings();
  useMediaStore.getState().resetSettings();
  useAnkiStore.getState().resetSettings();
}

beforeEach(() => {
  resetAllStores();
});

describe("collectSyncedSettings", () => {
  it("never includes API keys, test results, or runtime state", () => {
    // Plant secrets and transient state in every store that has them
    useAIStore.getState().setApiKey("chatgpt", AI_SECRET);
    useAIStore.getState().setTestResult("chatgpt", {
      success: true,
      message: "connection ok",
    });
    useMediaStore.getState().setApiKey("elevenLabs", ELEVENLABS_SECRET);
    useMediaStore.getState().setApiKey("replicate", REPLICATE_SECRET);
    useAnkiStore.getState().setReachable(true);
    useAnkiStore.getState().setConnectionStatus({
      connected: true,
      version: "6",
    });

    const collected = collectSyncedSettings();
    const json = JSON.stringify(collected);

    // No key material
    expect(json).not.toContain(AI_SECRET);
    expect(json).not.toContain(ELEVENLABS_SECRET);
    expect(json).not.toContain(REPLICATE_SECRET);

    // No secret/transient field names anywhere in the payload
    expect(json.toLowerCase()).not.toContain("apikey");
    expect(json).not.toContain("lastTestResults");
    expect(json).not.toContain("connection ok");
    expect(json).not.toContain("reachable");
    expect(json).not.toContain("connectionStatus");
  });

  it("collects the allowlisted slice of every store", () => {
    useSettingsStore
      .getState()
      .updateLanguages({ sourceLanguage: "German", targetLanguage: "Polish" });
    useSettingsStore.getState().updatePreferences({ darkMode: true });
    useAIStore.getState().setSelectedProvider("claude");
    useAIStore
      .getState()
      .setSelectedModel("claude", "claude-haiku-4-5-20250927");
    useMediaStore.getState().setTypeEnabled("image", true);
    useMediaStore
      .getState()
      .updateLanguageConfig("Polish", { imageStyle: "watercolor" });
    useAnkiStore.getState().setEnabled(true);
    useAnkiStore.getState().setDeck("Polish::Vocab");
    useAnkiStore.getState().setTags(["omnidict", "polish"]);

    const collected = collectSyncedSettings();

    expect(collected.version).toBe(1);
    expect(collected.settings.general).toEqual({
      languages: { sourceLanguage: "German", targetLanguage: "Polish" },
      preferences: { darkMode: true },
    });
    expect(collected.settings.ai.selectedProvider).toBe("claude");
    expect(collected.settings.ai.selectedModels.claude).toBe(
      "claude-haiku-4-5-20250927",
    );
    expect(collected.settings.media.enabledTypes.image).toBe(true);
    expect(collected.settings.media.languageConfigs.Polish.imageStyle).toBe(
      "watercolor",
    );
    expect(collected.settings.anki.enabled).toBe(true);
    expect(collected.settings.anki.deck).toBe("Polish::Vocab");
    expect(collected.settings.anki.tags).toEqual(["omnidict", "polish"]);
  });
});

describe("apply -> collect roundtrip", () => {
  it("reproduces the collected payload after a reset", () => {
    // Build a distinctive state across all four stores
    useSettingsStore
      .getState()
      .updateLanguages({ sourceLanguage: "English", targetLanguage: "Czech" });
    useSettingsStore.getState().updatePreferences({ darkMode: true });
    useAIStore.getState().setSelectedProvider("gemini");
    useAIStore.getState().setSelectedModel("gemini", "gemini-2.5-pro");
    useAIStore.getState().setSelectedModel("deepseek", "deepseek-v4-pro");
    useMediaStore.getState().setTypeEnabled("wordAudio", true);
    useMediaStore.getState().setTypeEnabled("sentenceAudio", true);
    useMediaStore.getState().updateLanguageConfig("Czech", {
      googleVoiceName: "cs-CZ-Chirp3-HD-Achernar",
      elevenLabsSpeed: 0.9,
      imageStyle: "sketch",
    });
    useAnkiStore.getState().setEnabled(true);
    useAnkiStore.getState().setDeck("Czech");
    useAnkiStore.getState().setFieldMappings([
      { ankiField: "Front", deepDictField: "headword" },
      { ankiField: "Back", deepDictField: "definition" },
      { ankiField: "Extra", deepDictField: "none", staticValue: "static" },
    ]);
    useAnkiStore.getState().setTags(["omnidict", "cz"]);

    const original = collectSyncedSettings();

    resetAllStores();
    expect(collectSyncedSettings()).not.toEqual(original);

    applySyncedSettings(original);

    expect(collectSyncedSettings()).toEqual(original);
  });
});

describe("applySyncedSettings with partial or malformed payloads", () => {
  it("applies present fields and leaves missing sections untouched", () => {
    useAIStore.getState().setSelectedProvider("chatgpt");
    useAnkiStore.getState().setDeck("Keep::Me");

    const partial = {
      version: 1,
      settings: {
        general: { preferences: { darkMode: true } },
      },
    };
    applySyncedSettings(partial);

    // Applied
    expect(useSettingsStore.getState().preferences.darkMode).toBe(true);
    // Missing inner field keeps current value
    expect(useSettingsStore.getState().languages.sourceLanguage).toBe(
      "English",
    );
    // Missing sections keep current values
    expect(useAIStore.getState().selectedProvider).toBe("chatgpt");
    expect(useAnkiStore.getState().deck).toBe("Keep::Me");
  });

  it("ignores non-object, wrong-version, and junk payloads without crashing", () => {
    const before = collectSyncedSettings();

    applySyncedSettings(null);
    applySyncedSettings(undefined);
    applySyncedSettings(42);
    applySyncedSettings("nope");
    applySyncedSettings([]);
    applySyncedSettings({ version: 2, settings: {} });
    applySyncedSettings({ version: 1 });
    applySyncedSettings({ version: 1, settings: null });
    applySyncedSettings({
      version: 1,
      settings: {
        general: "junk",
        ai: 7,
        media: [],
        anki: null,
      },
    });

    expect(collectSyncedSettings()).toEqual(before);
  });

  it("drops invalid values inside otherwise valid sections", () => {
    const payload = {
      version: 1,
      settings: {
        general: { languages: { sourceLanguage: 42 } },
        ai: {
          selectedProvider: "not-a-provider",
          selectedModels: {
            deepseek: "model-that-does-not-exist",
            gemini: "gemini-2.5-flash",
            bogusProvider: "whatever",
          },
        },
        media: {
          enabledTypes: { image: "yes", wordAudio: true },
          languageConfigs: {
            Czech: { imageStyle: "not-a-style", elevenLabsSpeed: 1.0 },
            Broken: "junk",
          },
        },
        anki: {
          enabled: true,
          fieldMappings: [
            { ankiField: "Front", deepDictField: "headword" },
            { ankiField: "Bad", deepDictField: "not-a-field" },
            "junk",
          ],
          tags: ["ok", 42],
        },
      },
    };

    applySyncedSettings(payload);

    // Invalid strings/numbers keep current values
    expect(useSettingsStore.getState().languages.sourceLanguage).toBe(
      "English",
    );
    expect(useAIStore.getState().selectedProvider).toBe("deepseek");
    // Unknown model rejected, known model applied
    expect(useAIStore.getState().selectedModels.deepseek).toBe(
      "deepseek-v4-flash",
    );
    expect(useAIStore.getState().selectedModels.gemini).toBe(
      "gemini-2.5-flash",
    );
    // Non-boolean toggle dropped, boolean applied
    expect(useMediaStore.getState().enabledTypes.image).toBe(false);
    expect(useMediaStore.getState().enabledTypes.wordAudio).toBe(true);
    // Invalid style falls back, valid number applied
    expect(useMediaStore.getState().languageConfigs.Czech.imageStyle).toBe(
      "gothic",
    );
    expect(useMediaStore.getState().languageConfigs.Czech.elevenLabsSpeed).toBe(
      1.0,
    );
    expect(useMediaStore.getState().languageConfigs.Broken).toBeUndefined();
    // Bad mappings filtered out; bad tags array rejected wholesale
    expect(useAnkiStore.getState().enabled).toBe(true);
    expect(useAnkiStore.getState().fieldMappings).toEqual([
      { ankiField: "Front", deepDictField: "headword" },
    ]);
    expect(useAnkiStore.getState().tags).toEqual(["omnidict"]);
  });

  it("does not resurrect secrets when applying a tampered payload", () => {
    const tampered: SyncedSettingsV1 = collectSyncedSettings();
    // Simulate a payload that somehow carries extra junk sections
    applySyncedSettings({
      ...tampered,
      settings: {
        ...tampered.settings,
        ai: {
          ...tampered.settings.ai,
          apiKeys: { chatgpt: "injected-key" },
        },
      },
    });

    // apiKeys in the payload is simply ignored — store keys stay empty
    expect(useAIStore.getState().apiKeys).toEqual({});
  });
});
