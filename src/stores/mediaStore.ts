import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LanguageMediaConfig, MediaType } from "@/lib/types";

/**
 * Media Generation Settings
 *
 * Global toggles control which media types are generated during Anki export;
 * per-language configs (keyed by target language name, e.g. "Czech") hold
 * voice IDs and art style. API keys live server-side in env vars.
 */

export const DEFAULT_LANGUAGE_MEDIA_CONFIG: LanguageMediaConfig = {
  googleLanguageCode: "",
  googleVoiceName: "",
  elevenLabsVoiceId: "",
  elevenLabsLanguageCode: "",
  elevenLabsSpeed: 0.85,
  imageStyle: "gothic",
};

/** Prefilled Google TTS / ElevenLabs language codes for common languages */
const LANGUAGE_CODE_DEFAULTS: Record<
  string,
  { googleLanguageCode: string; elevenLabsLanguageCode: string }
> = {
  Czech: { googleLanguageCode: "cs-CZ", elevenLabsLanguageCode: "cs" },
  Spanish: { googleLanguageCode: "es-ES", elevenLabsLanguageCode: "es" },
  German: { googleLanguageCode: "de-DE", elevenLabsLanguageCode: "de" },
  French: { googleLanguageCode: "fr-FR", elevenLabsLanguageCode: "fr" },
  Italian: { googleLanguageCode: "it-IT", elevenLabsLanguageCode: "it" },
  English: { googleLanguageCode: "en-US", elevenLabsLanguageCode: "en" },
  Portuguese: { googleLanguageCode: "pt-PT", elevenLabsLanguageCode: "pt" },
  Polish: { googleLanguageCode: "pl-PL", elevenLabsLanguageCode: "pl" },
  Dutch: { googleLanguageCode: "nl-NL", elevenLabsLanguageCode: "nl" },
  Russian: { googleLanguageCode: "ru-RU", elevenLabsLanguageCode: "ru" },
  Japanese: { googleLanguageCode: "ja-JP", elevenLabsLanguageCode: "ja" },
  Korean: { googleLanguageCode: "ko-KR", elevenLabsLanguageCode: "ko" },
};

export function defaultConfigForLanguage(
  language: string,
): LanguageMediaConfig {
  return {
    ...DEFAULT_LANGUAGE_MEDIA_CONFIG,
    ...LANGUAGE_CODE_DEFAULTS[language],
  };
}

/**
 * ElevenLabs and Replicate bill per use, so their keys are supplied by the
 * user here (like aiStore API keys) rather than living in server env vars —
 * nobody generates paid media on the deployment owner's account. Google TTS
 * is effectively free and stays a server-side env var.
 */
export interface MediaApiKeys {
  elevenLabs: string;
  replicate: string;
}

export interface MediaSettings {
  enabledTypes: Record<MediaType, boolean>;
  languageConfigs: Record<string, LanguageMediaConfig>;
  apiKeys: MediaApiKeys;
}

interface MediaState extends MediaSettings {
  setTypeEnabled: (type: MediaType, enabled: boolean) => void;
  setApiKey: (provider: keyof MediaApiKeys, key: string) => void;
  updateLanguageConfig: (
    language: string,
    config: Partial<LanguageMediaConfig>,
  ) => void;
  getConfigForLanguage: (language: string) => LanguageMediaConfig;
  resetSettings: () => void;
}

const defaultSettings: MediaSettings = {
  enabledTypes: {
    image: false,
    wordAudio: false,
    sentenceAudio: false,
  },
  languageConfigs: {},
  apiKeys: {
    elevenLabs: "",
    replicate: "",
  },
};

export const useMediaStore = create<MediaState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setTypeEnabled: (type, enabled) =>
        set((state) => ({
          enabledTypes: { ...state.enabledTypes, [type]: enabled },
        })),

      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),

      updateLanguageConfig: (language, config) =>
        set((state) => ({
          languageConfigs: {
            ...state.languageConfigs,
            [language]: {
              ...defaultConfigForLanguage(language),
              ...state.languageConfigs[language],
              ...config,
            },
          },
        })),

      getConfigForLanguage: (language) => ({
        ...defaultConfigForLanguage(language),
        ...get().languageConfigs[language],
      }),

      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "omnidict-media-settings",
      version: 1,
    },
  ),
);
