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
    darkMode: boolean;
  };
  ai: {
    provider: 'deepseek' | 'openai';
    temperature: number;
  };
}

interface SettingsState extends SimplifiedUserSettings {
  // Actions only - no hydration state to avoid SSR issues
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
    darkMode: false,
  },
  ai: {
    provider: 'deepseek',
    temperature: 0.7,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      updateLanguages: (languages) => {
        set((state) => ({
          languages: { ...state.languages, ...languages }
        }));
      },

      updatePreferences: (preferences) => {
        set((state) => ({
          preferences: { ...state.preferences, ...preferences }
        }));
      },

      updateAI: (ai) => {
        set((state) => ({
          ai: { ...state.ai, ...ai }
        }));
      },

      resetToDefaults: () => {
        set(defaultSettings);
      },
    }),
    {
      name: 'omnidict-settings',
      version: 4, // Increment version to force clean migration
      
      // Simple storage that works with SSR
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          try {
            const item = localStorage.getItem(name);
            return item ? JSON.parse(item) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // Ignore storage errors
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          try {
            localStorage.removeItem(name);
          } catch {
            // Ignore storage errors
          }
        },
      },
      
      // Migration function to handle version changes
      migrate: (persistedState: any, version: number) => {
        // For any version less than 4, reset to defaults
        if (version < 4) {
          console.log('Migrating settings store to v4 - resetting to defaults');
          return defaultSettings;
        }
        
        // Ensure all required fields exist
        const migrated = {
          ...defaultSettings,
          ...persistedState,
        };
        
        // Validate structure
        if (!migrated.languages || typeof migrated.languages !== 'object') {
          migrated.languages = defaultSettings.languages;
        }
        if (!migrated.preferences || typeof migrated.preferences !== 'object') {
          migrated.preferences = defaultSettings.preferences;
        }
        if (!migrated.ai || typeof migrated.ai !== 'object') {
          migrated.ai = defaultSettings.ai;
        }
        
        return migrated;
      },
      
      // Skip hydration on server
      skipHydration: typeof window === 'undefined',
    }
  )
);

// Stable selectors that prevent unnecessary re-renders
export const useLanguages = () => {
  return useSettingsStore((state) => state.languages);
};

export const usePreferences = () => {
  return useSettingsStore((state) => state.preferences);
};

export const useAISettings = () => {
  return useSettingsStore((state) => state.ai);
};

// Stable action selectors
export const useSettingsActions = () => {
  return useSettingsStore((state) => ({
    updateLanguages: state.updateLanguages,
    updatePreferences: state.updatePreferences,
    updateAI: state.updateAI,
    resetToDefaults: state.resetToDefaults,
  }));
};