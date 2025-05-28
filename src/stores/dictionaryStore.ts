import { create } from 'zustand';
import { DictionaryEntry, SearchFilters, LanguageSettings } from '@/lib/types';

// Context-aware state management
interface ContextState {
  contextSentence: string;
  selectedWord: string;
  isContextMode: boolean;
  selectedWordRange?: { start: number; end: number };
  isContextExpanded: boolean;
}

// Simplified language settings - just from and to
interface SimplifiedLanguageSettings {
  sourceLanguage: string;
  targetLanguage: string;
}

interface DictionaryState {
  // Current data
  entries: DictionaryEntry[];
  currentEntry: DictionaryEntry | null;
  recentEntries: DictionaryEntry[];
  
  // Search and filtering
  searchFilters: SearchFilters;
  searchLoading: boolean;
  searchResults: {
    entries: DictionaryEntry[];
    total: number;
    page: number;
    pageSize: number;
  };

  // Languages
  availableLanguages: {
    sourceLanguages: string[];
    targetLanguages: string[];
  };
  languageSettings: SimplifiedLanguageSettings;

  // Context-aware search state
  context: ContextState;

  // UI state
  loading: boolean;
  error: string | null;
  allEntriesLoaded: boolean;
  
  // Basic actions
  setEntries: (entries: DictionaryEntry[]) => void;
  setCurrentEntry: (entry: DictionaryEntry | null) => void;
  addToRecentEntries: (entry: DictionaryEntry, isNewOrSearched?: boolean) => void;
  
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  setSearchLoading: (loading: boolean) => void;
  setSearchResults: (results: {
    entries: DictionaryEntry[];
    total: number;
    page: number;
    pageSize: number;
  }) => void;

  setAvailableLanguages: (languages: {
    sourceLanguages: string[];
    targetLanguages: string[];
  }) => void;
  setLanguageSettings: (settings: Partial<SimplifiedLanguageSettings>) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAllEntriesLoaded: (loaded: boolean) => void;
  
  // Context-aware actions
  setContextSentence: (sentence: string) => void;
  setSelectedWord: (word: string, range?: { start: number; end: number }) => void;
  setContextMode: (isActive: boolean) => void;
  setContextExpanded: (expanded: boolean) => void;
  clearContext: () => void;
  selectWordFromContext: (word: string, start: number, end: number) => void;
  
  // Complex actions
  addEntry: (entry: DictionaryEntry) => void;
  updateEntry: (headword: string, updatedEntry: DictionaryEntry) => void;
  removeEntry: (headword: string) => void;
  clearSearch: () => void;
  loadAllEntries: () => Promise<void>;
}

// Initial context state
const initialContextState: ContextState = {
  contextSentence: '',
  selectedWord: '',
  isContextMode: false,
  selectedWordRange: undefined,
  isContextExpanded: false,
};

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  // Initial state
  entries: [],
  currentEntry: null,
  recentEntries: [],
  
  searchFilters: {},
  searchLoading: false,
  searchResults: {
    entries: [],
    total: 0,
    page: 1,
    pageSize: 50,
  },

  availableLanguages: {
    sourceLanguages: [],
    targetLanguages: [],
  },
  languageSettings: {
    sourceLanguage: 'English',
    targetLanguage: 'Czech',
  },

  // Context state
  context: initialContextState,

  loading: false,
  error: null,
  allEntriesLoaded: false,

  // Basic setters
  setEntries: (entries) => set({ entries }),
  setCurrentEntry: (entry) => set({ currentEntry: entry }),
  
  // Modified to only add to recent when it's a new entry or searched, limit to 5
  addToRecentEntries: (entry, isNewOrSearched = false) => set((state) => {
    if (!isNewOrSearched) return state; // Don't add to recent if just viewing
    
    const filtered = state.recentEntries.filter(e => e.headword !== entry.headword);
    return {
      recentEntries: [entry, ...filtered].slice(0, 5) // Keep only 5 recent entries
    };
  }),

  setSearchFilters: (filters) => set((state) => ({
    searchFilters: { ...state.searchFilters, ...filters }
  })),
  setSearchLoading: (loading) => set({ searchLoading: loading }),
  setSearchResults: (results) => set({ searchResults: results }),

  setAvailableLanguages: (languages) => set({ availableLanguages: languages }),
  setLanguageSettings: (settings) => set((state) => ({
    languageSettings: { ...state.languageSettings, ...settings }
  })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setAllEntriesLoaded: (loaded) => set({ allEntriesLoaded: loaded }),

  // Context-aware actions
  setContextSentence: (sentence) => set((state) => ({
    context: { 
      ...state.context, 
      contextSentence: sentence,
      isContextMode: sentence.trim().length > 0,
      isContextExpanded: sentence.trim().length > 0 || state.context.isContextExpanded,
    }
  })),

  setSelectedWord: (word, range) => set((state) => ({
    context: { 
      ...state.context, 
      selectedWord: word,
      selectedWordRange: range,
    }
  })),

  setContextMode: (isActive) => set((state) => ({
    context: { ...state.context, isContextMode: isActive }
  })),

  setContextExpanded: (expanded) => set((state) => ({
    context: { ...state.context, isContextExpanded: expanded }
  })),

  clearContext: () => set((state) => ({
    context: {
      ...initialContextState,
      isContextExpanded: state.context.isContextExpanded, // Preserve expansion state
    }
  })),

  selectWordFromContext: (word, start, end) => set((state) => ({
    context: {
      ...state.context,
      selectedWord: word,
      selectedWordRange: { start, end },
    }
  })),

  // Complex actions
  addEntry: (entry) => set((state) => ({
    entries: [entry, ...state.entries],
    currentEntry: entry,
  })),

  updateEntry: (headword, updatedEntry) => set((state) => ({
    entries: state.entries.map(entry => 
      entry.headword === headword ? updatedEntry : entry
    ),
    currentEntry: state.currentEntry?.headword === headword ? updatedEntry : state.currentEntry,
  })),

  removeEntry: (headword) => set((state) => ({
    entries: state.entries.filter(entry => entry.headword !== headword),
    currentEntry: state.currentEntry?.headword === headword ? null : state.currentEntry,
    recentEntries: state.recentEntries.filter(entry => entry.headword !== headword),
  })),

  clearSearch: () => set({
    searchFilters: {},
    searchResults: {
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
    },
  }),

  // Load all entries for current language settings
  loadAllEntries: async () => {
    const { languageSettings, setLoading, setError, setEntries, setAllEntriesLoaded } = get();
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/entries/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filters: {
            sourceLanguage: languageSettings.sourceLanguage,
            targetLanguage: languageSettings.targetLanguage,
          },
          page: 1,
          pageSize: 1000, // Load up to 1000 entries
        }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setEntries(result.data.entries);
        setAllEntriesLoaded(true);
      } else {
        setError(result.error || 'Failed to load entries');
      }
    } catch (error) {
      setError('Network error while loading entries');
    } finally {
      setLoading(false);
    }
  },
}));