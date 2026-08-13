import {
  AIProviderType,
  VALID_PROVIDER_TYPES,
  isKnownModel,
  isValidProviderType,
} from "@/lib/ai/providers/metadata";
import {
  AnkiFieldMapping,
  IMAGE_STYLE_VALUES,
  ImageStyle,
  LanguageMediaConfig,
  MediaType,
} from "@/lib/types";
import { useAIStore } from "@/stores/aiStore";
import { useAnkiStore } from "@/stores/ankiStore";
import { defaultConfigForLanguage, useMediaStore } from "@/stores/mediaStore";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Server-synced settings envelope (version 1).
 *
 * This is an explicit allowlist of what leaves the browser. Secrets (AI and
 * media API keys) and transient runtime state (test results, Anki
 * connectivity) must NEVER appear here — collection builds the object field
 * by field rather than spreading store state, so a new store field is
 * excluded until someone deliberately adds it.
 */
export interface SyncedSettingsV1 {
  version: 1;
  settings: {
    general: {
      languages: {
        sourceLanguage: string;
        targetLanguage: string;
      };
      preferences: {
        darkMode: boolean;
      };
    };
    ai: {
      selectedProvider: AIProviderType;
      selectedModels: Partial<Record<AIProviderType, string>>;
    };
    media: {
      enabledTypes: Record<MediaType, boolean>;
      languageConfigs: Record<string, LanguageMediaConfig>;
    };
    anki: {
      enabled: boolean;
      deck: string;
      noteType: string;
      fieldMappings: AnkiFieldMapping[];
      tags: string[];
    };
  };
}

const MEDIA_TYPES: readonly MediaType[] = [
  "image",
  "wordAudio",
  "sentenceAudio",
];

const DEEP_DICT_FIELDS: readonly AnkiFieldMapping["deepDictField"][] = [
  "headword",
  "definition",
  "partOfSpeech",
  "example",
  "translation",
  "tags",
  "image",
  "wordAudio",
  "sentenceAudio",
  "none",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageStyle(value: unknown): value is ImageStyle {
  return (
    typeof value === "string" && IMAGE_STYLE_VALUES.some((s) => s === value)
  );
}

function isDeepDictField(
  value: unknown,
): value is AnkiFieldMapping["deepDictField"] {
  return typeof value === "string" && DEEP_DICT_FIELDS.some((f) => f === value);
}

/** Rebuild a field mapping with only the allowlisted fields. */
function toFieldMapping(value: unknown): AnkiFieldMapping | null {
  if (!isRecord(value)) return null;
  if (typeof value.ankiField !== "string") return null;
  if (!isDeepDictField(value.deepDictField)) return null;

  const mapping: AnkiFieldMapping = {
    ankiField: value.ankiField,
    deepDictField: value.deepDictField,
  };
  if (typeof value.staticValue === "string") {
    mapping.staticValue = value.staticValue;
  }
  return mapping;
}

/** Copy a language media config field by field over a known-good base. */
function sanitizeLanguageConfig(
  value: Record<string, unknown>,
  base: LanguageMediaConfig,
): LanguageMediaConfig {
  return {
    googleLanguageCode:
      typeof value.googleLanguageCode === "string"
        ? value.googleLanguageCode
        : base.googleLanguageCode,
    googleVoiceName:
      typeof value.googleVoiceName === "string"
        ? value.googleVoiceName
        : base.googleVoiceName,
    elevenLabsVoiceId:
      typeof value.elevenLabsVoiceId === "string"
        ? value.elevenLabsVoiceId
        : base.elevenLabsVoiceId,
    elevenLabsLanguageCode:
      typeof value.elevenLabsLanguageCode === "string"
        ? value.elevenLabsLanguageCode
        : base.elevenLabsLanguageCode,
    elevenLabsSpeed:
      typeof value.elevenLabsSpeed === "number" &&
      Number.isFinite(value.elevenLabsSpeed)
        ? value.elevenLabsSpeed
        : base.elevenLabsSpeed,
    imageStyle: isImageStyle(value.imageStyle)
      ? value.imageStyle
      : base.imageStyle,
  };
}

/**
 * Snapshot the syncable slice of every settings store.
 *
 * Explicit allowlist: apiKeys (aiStore, mediaStore), lastTestResults
 * (aiStore), and all Anki runtime/connection state are intentionally
 * absent. Do not add spreads of whole store states here.
 */
export function collectSyncedSettings(): SyncedSettingsV1 {
  const general = useSettingsStore.getState();
  const ai = useAIStore.getState();
  const media = useMediaStore.getState();
  const anki = useAnkiStore.getState();

  const selectedModels: Partial<Record<AIProviderType, string>> = {};
  for (const provider of VALID_PROVIDER_TYPES) {
    const model = ai.selectedModels[provider];
    if (typeof model === "string") {
      selectedModels[provider] = model;
    }
  }

  const languageConfigs: Record<string, LanguageMediaConfig> = {};
  for (const [language, config] of Object.entries(media.languageConfigs)) {
    // Field-by-field copy keeps the allowlist explicit even here
    languageConfigs[language] = {
      googleLanguageCode: config.googleLanguageCode,
      googleVoiceName: config.googleVoiceName,
      elevenLabsVoiceId: config.elevenLabsVoiceId,
      elevenLabsLanguageCode: config.elevenLabsLanguageCode,
      elevenLabsSpeed: config.elevenLabsSpeed,
      imageStyle: config.imageStyle,
    };
  }

  return {
    version: 1,
    settings: {
      general: {
        languages: {
          sourceLanguage: general.languages.sourceLanguage,
          targetLanguage: general.languages.targetLanguage,
        },
        preferences: {
          darkMode: general.preferences.darkMode,
        },
      },
      ai: {
        selectedProvider: ai.selectedProvider,
        selectedModels,
      },
      media: {
        enabledTypes: {
          image: media.enabledTypes.image,
          wordAudio: media.enabledTypes.wordAudio,
          sentenceAudio: media.enabledTypes.sentenceAudio,
        },
        languageConfigs,
      },
      anki: {
        enabled: anki.enabled,
        deck: anki.deck,
        noteType: anki.noteType,
        fieldMappings: anki.fieldMappings
          .map(toFieldMapping)
          .filter((m): m is AnkiFieldMapping => m !== null),
        tags: anki.tags.filter((tag): tag is string => typeof tag === "string"),
      },
    },
  };
}

function applyGeneral(section: unknown): void {
  if (!isRecord(section)) return;
  const current = useSettingsStore.getState();
  const updates: Partial<
    Pick<
      ReturnType<typeof useSettingsStore.getState>,
      "languages" | "preferences"
    >
  > = {};

  if (isRecord(section.languages)) {
    updates.languages = {
      sourceLanguage:
        typeof section.languages.sourceLanguage === "string"
          ? section.languages.sourceLanguage
          : current.languages.sourceLanguage,
      targetLanguage:
        typeof section.languages.targetLanguage === "string"
          ? section.languages.targetLanguage
          : current.languages.targetLanguage,
    };
  }

  if (isRecord(section.preferences)) {
    updates.preferences = {
      darkMode:
        typeof section.preferences.darkMode === "boolean"
          ? section.preferences.darkMode
          : current.preferences.darkMode,
    };
  }

  if (Object.keys(updates).length > 0) {
    useSettingsStore.setState(updates);
  }
}

function applyAI(section: unknown): void {
  if (!isRecord(section)) return;
  const updates: {
    selectedProvider?: AIProviderType;
    selectedModels?: Partial<Record<AIProviderType, string>>;
  } = {};

  if (
    typeof section.selectedProvider === "string" &&
    isValidProviderType(section.selectedProvider)
  ) {
    updates.selectedProvider = section.selectedProvider;
  }

  if (isRecord(section.selectedModels)) {
    const merged = { ...useAIStore.getState().selectedModels };
    for (const provider of VALID_PROVIDER_TYPES) {
      const model = section.selectedModels[provider];
      // Ignore model ids the current registry doesn't recognize (e.g. a
      // payload written by a newer/older client) — keep the local value.
      if (typeof model === "string" && isKnownModel(provider, model)) {
        merged[provider] = model;
      }
    }
    updates.selectedModels = merged;
  }

  if (Object.keys(updates).length > 0) {
    useAIStore.setState(updates);
  }
}

function applyMedia(section: unknown): void {
  if (!isRecord(section)) return;
  const current = useMediaStore.getState();
  const updates: {
    enabledTypes?: Record<MediaType, boolean>;
    languageConfigs?: Record<string, LanguageMediaConfig>;
  } = {};

  if (isRecord(section.enabledTypes)) {
    const merged = { ...current.enabledTypes };
    for (const type of MEDIA_TYPES) {
      const enabled = section.enabledTypes[type];
      if (typeof enabled === "boolean") {
        merged[type] = enabled;
      }
    }
    updates.enabledTypes = merged;
  }

  if (isRecord(section.languageConfigs)) {
    const merged = { ...current.languageConfigs };
    for (const [language, config] of Object.entries(section.languageConfigs)) {
      if (!isRecord(config)) continue;
      merged[language] = sanitizeLanguageConfig(
        config,
        current.languageConfigs[language] ?? defaultConfigForLanguage(language),
      );
    }
    updates.languageConfigs = merged;
  }

  if (Object.keys(updates).length > 0) {
    useMediaStore.setState(updates);
  }
}

function applyAnki(section: unknown): void {
  if (!isRecord(section)) return;
  const updates: {
    enabled?: boolean;
    deck?: string;
    noteType?: string;
    fieldMappings?: AnkiFieldMapping[];
    tags?: string[];
  } = {};

  if (typeof section.enabled === "boolean") updates.enabled = section.enabled;
  if (typeof section.deck === "string") updates.deck = section.deck;
  if (typeof section.noteType === "string") {
    updates.noteType = section.noteType;
  }
  if (Array.isArray(section.fieldMappings)) {
    updates.fieldMappings = section.fieldMappings
      .map(toFieldMapping)
      .filter((m): m is AnkiFieldMapping => m !== null);
  }
  if (
    Array.isArray(section.tags) &&
    section.tags.every((tag): tag is string => typeof tag === "string")
  ) {
    updates.tags = section.tags;
  }

  if (Object.keys(updates).length > 0) {
    useAnkiStore.setState(updates);
  }
}

/**
 * Merge a server-synced settings payload into the local stores.
 *
 * Accepts `unknown` because the payload crosses a trust boundary (it was
 * fetched from the server and may have been written by an older or newer
 * client). Every field is individually validated; anything missing or
 * malformed keeps its current local value. Never throws on bad input.
 */
export function applySyncedSettings(payload: unknown): void {
  if (!isRecord(payload)) return;
  if (payload.version !== 1) return;
  if (!isRecord(payload.settings)) return;

  applyGeneral(payload.settings.general);
  applyAI(payload.settings.ai);
  applyMedia(payload.settings.media);
  applyAnki(payload.settings.anki);
}
