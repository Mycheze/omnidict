import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Simplified language settings
interface SimplifiedLanguageSettings {
  sourceLanguage: string;
  targetLanguage: string;
}

interface SimplifiedUserSettings {
  languages: SimplifiedLanguageSettings;
  preferences: {
    autoSave: boolean;
    showTranslations: boolean;
    enableClipboardMonitoring: boolean;
  };
  ai: {
    provider: 'deepseek' | 'openai';
    temperature: number;
  };
}

interface SettingsState extends SimplifiedUserSettings {
  // Actions
  updateLanguages: (languages: Partial<SimplifiedLanguageSettings>) => void;
  updatePreferences: (preferences: Partial<SimplifiedUserSettings['preferences']>) => void;
  updateAI: (ai: Partial<SimplifiedUserSettings['ai']>) => void;
  resetToDefaults: () => void;
}

const defaultSettings: SimplifiedUserSettings = {
  languages: {
    sourceLanguage: 'English',
    targetLanguage: 'Czech',
  },
  preferences: {
    autoSave: true,
    showTranslations: true,
    enableClipboardMonitoring: false,
  },
  ai: {
    provider: 'deepseek',
    temperature: 0.7,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      updateLanguages: (languages) => {
        set((state) => ({
          languages: { ...state.languages, ...languages }
        }));
        
        // Reset dictionary state when languages change
        // We'll do this from the component to avoid circular dependencies
      },

      updatePreferences: (preferences) => set((state) => ({
        preferences: { ...state.preferences, ...preferences }
      })),

      updateAI: (ai) => set((state) => ({
        ai: { ...state.ai, ...ai }
      })),

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'deep-dict-settings',
      version: 2, // Increment version to handle the schema change
    }
  )
);