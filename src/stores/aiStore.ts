import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AIProviderType,
  PROVIDER_METADATA,
  isKnownModel,
  isValidProviderType,
} from "@/lib/ai/providers/metadata";

/**
 * AI Provider Settings
 */
export interface AISettings {
  // Selected provider
  selectedProvider: AIProviderType;

  // API keys per provider (not stored for DeepSeek)
  apiKeys: Partial<Record<AIProviderType, string>>;

  // Selected model per provider
  selectedModels: Partial<Record<AIProviderType, string>>;

  // Last test results per provider
  lastTestResults: Partial<
    Record<
      AIProviderType,
      { success: boolean; message?: string; timestamp: number }
    >
  >;
}

interface AIState extends AISettings {
  // Actions
  setSelectedProvider: (provider: AIProviderType) => void;
  setApiKey: (provider: AIProviderType, apiKey: string) => void;
  setSelectedModel: (provider: AIProviderType, model: string) => void;
  setTestResult: (
    provider: AIProviderType,
    result: { success: boolean; message?: string },
  ) => void;
  clearApiKey: (provider: AIProviderType) => void;
  resetSettings: () => void;
}

/** Default model per provider, derived from the metadata registry */
function defaultModels(): Record<AIProviderType, string> {
  return Object.fromEntries(
    Object.values(PROVIDER_METADATA).map((p) => [p.id, p.defaultModel]),
  ) as Record<AIProviderType, string>;
}

const defaultSettings: AISettings = {
  selectedProvider: "deepseek",
  apiKeys: {},
  selectedModels: defaultModels(),
  lastTestResults: {},
};

// DeepSeek legacy model names sunset 2026-07-24; remap persisted values
const LEGACY_MODEL_MAP: Record<string, string> = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
};

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      // Actions
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      setApiKey: (provider, apiKey) =>
        set((state) => ({
          apiKeys: {
            ...state.apiKeys,
            [provider]: apiKey,
          },
        })),

      setSelectedModel: (provider, model) =>
        set((state) => ({
          selectedModels: {
            ...state.selectedModels,
            [provider]: model,
          },
        })),

      setTestResult: (provider, result) =>
        set((state) => ({
          lastTestResults: {
            ...state.lastTestResults,
            [provider]: {
              ...result,
              timestamp: Date.now(),
            },
          },
        })),

      clearApiKey: (provider) =>
        set((state) => {
          const newApiKeys = { ...state.apiKeys };
          delete newApiKeys[provider];
          return { apiKeys: newApiKeys };
        }),

      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "omnidict-ai-settings",
      version: 3,
      migrate: (persistedState, version) => {
        // Guard rather than assert: localStorage contents are untrusted
        if (
          persistedState === null ||
          typeof persistedState !== "object" ||
          Array.isArray(persistedState)
        ) {
          return defaultSettings;
        }
        const persisted = persistedState as Partial<AISettings>;

        // Deep-merge selectedModels over defaults (never clobber the map),
        // remap legacy DeepSeek names, and reset any model id the current
        // registry doesn't recognize to that provider's default.
        const mergedModels: Record<AIProviderType, string> = defaultModels();
        for (const [provider, model] of Object.entries(
          persisted.selectedModels ?? {},
        )) {
          if (!isValidProviderType(provider) || typeof model !== "string") {
            continue;
          }
          const remapped = LEGACY_MODEL_MAP[model] ?? model;
          if (isKnownModel(provider, remapped)) {
            mergedModels[provider] = remapped;
          }
          // Unknown/stale ids keep the registry default set above
        }

        const selectedProvider =
          typeof persisted.selectedProvider === "string" &&
          isValidProviderType(persisted.selectedProvider)
            ? persisted.selectedProvider
            : defaultSettings.selectedProvider;

        void version; // migration is idempotent across all prior versions

        return {
          ...defaultSettings,
          ...persisted,
          selectedProvider,
          selectedModels: mergedModels,
        };
      },
    },
  ),
);
