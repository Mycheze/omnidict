import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AIProviderType } from "@/lib/ai/providers/metadata";

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

const defaultSettings: AISettings = {
  selectedProvider: "deepseek",
  apiKeys: {},
  selectedModels: {
    deepseek: "deepseek-v4-flash",
    chatgpt: "gpt-4o",
    claude: "claude-3-5-sonnet-20241022",
    gemini: "gemini-2.5-flash",
  },
  lastTestResults: {},
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
      version: 1,
    },
  ),
);
