import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ManagedLanguage, LanguageManagementState } from '@/lib/types';

interface LanguageStore extends LanguageManagementState {
  // UI State
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Language Management
  addLanguage: (type: 'source' | 'target', language: ManagedLanguage) => void;
  updateLanguage: (type: 'source' | 'target', standardizedName: string, updates: Partial<ManagedLanguage>) => void;
  toggleLanguageVisibility: (type: 'source' | 'target', standardizedName: string) => void;
  removeCustomLanguage: (type: 'source' | 'target', standardizedName: string) => void;
  
  // Sync with database
  syncWithDatabase: () => Promise<void>;
  initializeFromDatabase: () => Promise<void>;
  
  // Get visible languages for dropdowns
  getVisibleSourceLanguages: () => ManagedLanguage[];
  getVisibleTargetLanguages: () => ManagedLanguage[];
}

const defaultState: LanguageManagementState = {
  sourceLanguages: [],
  targetLanguages: [],
  lastSyncTime: null,
};

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set, get) => ({
      ...defaultState,
      isLoading: false,
      error: null,

      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      addLanguage: (type, language) => {
        const currentLanguages = get()[type === 'source' ? 'sourceLanguages' : 'targetLanguages'];
        
        // Check if language already exists
        const exists = currentLanguages.some(lang => 
          lang.standardizedName.toLowerCase() === language.standardizedName.toLowerCase()
        );
        
        if (exists) {
          set({ error: `${language.standardizedName} already exists in your ${type} languages` });
          return;
        }

        set((state) => ({
          [type === 'source' ? 'sourceLanguages' : 'targetLanguages']: [
            ...currentLanguages,
            language
          ],
          error: null,
        }));
      },

      updateLanguage: (type, standardizedName, updates) => {
        const languageKey = type === 'source' ? 'sourceLanguages' : 'targetLanguages';
        const currentLanguages = get()[languageKey];
        
        set((state) => ({
          [languageKey]: currentLanguages.map(lang =>
            lang.standardizedName === standardizedName
              ? { ...lang, ...updates }
              : lang
          )
        }));
      },

      toggleLanguageVisibility: (type, standardizedName) => {
        const { updateLanguage } = get();
        const languageKey = type === 'source' ? 'sourceLanguages' : 'targetLanguages';
        const currentLanguages = get()[languageKey];
        const language = currentLanguages.find(lang => lang.standardizedName === standardizedName);
        
        if (language) {
          updateLanguage(type, standardizedName, { visible: !language.visible });
        }
      },

      removeCustomLanguage: (type, standardizedName) => {
        const languageKey = type === 'source' ? 'sourceLanguages' : 'targetLanguages';
        const currentLanguages = get()[languageKey];
        
        set((state) => ({
          [languageKey]: currentLanguages.filter(lang => 
            !(lang.standardizedName === standardizedName && lang.isCustom)
          )
        }));
      },

      syncWithDatabase: async () => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await fetch('/api/languages');
          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to fetch database languages');
          }
          
          const dbLanguages = result.data;
          const { sourceLanguages, targetLanguages } = get();
          
          // Add new languages from database if they don't exist
          const newSourceLanguages = [...sourceLanguages];
          const newTargetLanguages = [...targetLanguages];
          
          // Add source languages from DB
          dbLanguages.sourceLanguages.forEach((dbLang: string) => {
            const exists = newSourceLanguages.some(lang => 
              lang.standardizedName.toLowerCase() === dbLang.toLowerCase()
            );
            
            if (!exists) {
              newSourceLanguages.push({
                standardizedName: dbLang,
                displayName: dbLang,
                visible: true,
                isCustom: false,
              });
            }
          });
          
          // Add target languages from DB
          dbLanguages.targetLanguages.forEach((dbLang: string) => {
            const exists = newTargetLanguages.some(lang => 
              lang.standardizedName.toLowerCase() === dbLang.toLowerCase()
            );
            
            if (!exists) {
              newTargetLanguages.push({
                standardizedName: dbLang,
                displayName: dbLang,
                visible: true,
                isCustom: false,
              });
            }
          });
          
          set({
            sourceLanguages: newSourceLanguages,
            targetLanguages: newTargetLanguages,
            lastSyncTime: Date.now(),
          });
          
        } catch (error) {
          console.error('Failed to sync with database:', error);
          set({ error: error instanceof Error ? error.message : 'Sync failed' });
        } finally {
          set({ isLoading: false });
        }
      },

      initializeFromDatabase: async () => {
        const { lastSyncTime } = get();
        
        // Only initialize if we haven't synced before
        if (!lastSyncTime) {
          await get().syncWithDatabase();
        }
      },

      getVisibleSourceLanguages: () => {
        return get().sourceLanguages.filter(lang => lang.visible);
      },

      getVisibleTargetLanguages: () => {
        return get().targetLanguages.filter(lang => lang.visible);
      },
    }),
    {
      name: 'deep-dict-language-management',
      version: 1,
    }
  )
);