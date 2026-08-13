import { create } from "zustand";
import { persist } from "zustand/middleware";

// Simplified language settings
interface SimplifiedLanguageSettings {
  sourceLanguage: string;
  targetLanguage: string;
}

interface SimplifiedUserSettings {
  languages: SimplifiedLanguageSettings;
  preferences: {
    darkMode: boolean;
  };
}

interface SettingsState extends SimplifiedUserSettings {
  // Actions only - no hydration state to avoid SSR issues
  updateLanguages: (languages: Partial<SimplifiedLanguageSettings>) => void;
  updatePreferences: (
    preferences: Partial<SimplifiedUserSettings["preferences"]>,
  ) => void;
  resetToDefaults: () => void;
}

const defaultSettings: SimplifiedUserSettings = {
  languages: {
    sourceLanguage: "English",
    targetLanguage: "Czech",
  },
  preferences: {
    darkMode: false,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateLanguages: (languages) => {
        set((state) => ({
          languages: { ...state.languages, ...languages },
        }));
      },

      updatePreferences: (preferences) => {
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        }));
      },

      resetToDefaults: () => {
        set(defaultSettings);
      },
    }),
    {
      name: "omnidict-settings",
      version: 5, // v5 drops the dead ai block and unused preference flags

      // Simple storage that works with SSR
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          try {
            const item = localStorage.getItem(name);
            return item ? JSON.parse(item) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // Ignore storage errors
          }
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          try {
            localStorage.removeItem(name);
          } catch {
            // Ignore storage errors
          }
        },
      },

      // Migration function to handle version changes
      migrate: (persistedState: unknown, version: number) => {
        // For any version less than 4, reset to defaults (historical rule)
        if (
          version < 4 ||
          persistedState === null ||
          typeof persistedState !== "object"
        ) {
          return defaultSettings;
        }

        // v4 → v5: keep only the fields that survive; drops ai block and
        // dead preference flags automatically by rebuilding the shape
        const state = persistedState as {
          languages?: { sourceLanguage?: unknown; targetLanguage?: unknown };
          preferences?: { darkMode?: unknown };
        };

        return {
          languages: {
            sourceLanguage:
              typeof state.languages?.sourceLanguage === "string"
                ? state.languages.sourceLanguage
                : defaultSettings.languages.sourceLanguage,
            targetLanguage:
              typeof state.languages?.targetLanguage === "string"
                ? state.languages.targetLanguage
                : defaultSettings.languages.targetLanguage,
          },
          preferences: {
            darkMode:
              typeof state.preferences?.darkMode === "boolean"
                ? state.preferences.darkMode
                : defaultSettings.preferences.darkMode,
          },
        };
      },
    },
  ),
);
