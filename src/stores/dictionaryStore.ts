import { create } from 'zustand';
import { DictionaryEntry } from '@/lib/types';

// Context-aware state management
interface ContextState {
  contextSentence: string;
  selectedWord: string;
  isContextMode: boolean;
  selectedWordRange?: { start: number; end: number };
  isContextExpanded: boolean;
}

interface DictionaryState {
  // Current data
  entries: DictionaryEntry[];
  currentEntry: DictionaryEntry | null;
  recentEntries: DictionaryEntry[];
  
  // Search and filtering
  searchLoading: boolean;
  searchResults: {
    entries: DictionaryEntry[];
    total: number;
    page: number;
    pageSize: number;
  };

  // Context-aware search state
  context: ContextState;

  // UI state
  loading: boolean;
  error: string | null;
  allEntriesLoaded: boolean;
}

interface DictionaryActions {
  // Basic setters
  setEntries: (entries: DictionaryEntry[]) => void;
  setCurrentEntry: (entry: DictionaryEntry | null) => void;
  addToRecentEntries: (entry: DictionaryEntry, isNewOrSearched?: boolean) => void;
  
  setSearchLoading: (loading: boolean) => void;
  setSearchResults: (results: {
    entries: DictionaryEntry[];
    total: number;
    page: number;
    pageSize: number;
  }) => void;

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
}

// Initial context state
const initialContextState: ContextState = {
  contextSentence: '',
  selectedWord: '',
  isContextMode: false,
  selectedWordRange: undefined,
  isContextExpanded: false,
};

export const useDictionaryStore = create<DictionaryState & DictionaryActions>()(
  (set, get) => ({
    // Initial state
    entries: [],
    currentEntry: null,
    recentEntries: [],
    
    searchLoading: false,
    searchResults: {
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
    },

    // Context state
    context: initialContextState,

    loading: false,
    error: null,
    allEntriesLoaded: false,

    // Basic setters
    setEntries: (entries) => set({ entries }),
    setCurrentEntry: (entry) => set({ currentEntry: entry }),
    
    /**
     * Add to recent entries - simple implementation without language filtering
     * Language filtering will be done in the useDictionary hook
     */
    addToRecentEntries: (entry, isNewOrSearched = false) => {
      if (!isNewOrSearched) return; // Don't add to recent if just viewing
      
      set((state) => {
        // Remove any existing entry with same headword to avoid duplicates
        const filtered = state.recentEntries.filter(e => e.headword !== entry.headword);
        const newRecentEntries = [entry, ...filtered].slice(0, 5); // Keep last 10
        
        return { recentEntries: newRecentEntries };
      });
    },

    setSearchLoading: (loading) => set({ searchLoading: loading }),
    setSearchResults: (results) => set({ searchResults: results }),

    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setAllEntriesLoaded: (loaded) => set({ allEntriesLoaded: loaded }),

    // Context-aware actions
    setContextSentence: (sentence) => {
      set((state) => ({
        context: { 
          ...state.context, 
          contextSentence: sentence,
          isContextMode: sentence.trim().length > 0,
          isContextExpanded: sentence.trim().length > 0 || state.context.isContextExpanded,
        }
      }));
    },

    setSelectedWord: (word, range) => {
      set((state) => ({
        context: { 
          ...state.context, 
          selectedWord: word,
          selectedWordRange: range,
        }
      }));
    },

    setContextMode: (isActive) => {
      set((state) => ({
        context: { ...state.context, isContextMode: isActive }
      }));
    },

    setContextExpanded: (expanded) => set((state) => ({
      context: { ...state.context, isContextExpanded: expanded }
    })),

    clearContext: () => {
      set((state) => ({
        context: {
          ...initialContextState,
          isContextExpanded: state.context.isContextExpanded,
        }
      }));
    },

    selectWordFromContext: (word, start, end) => {
      set((state) => ({
        context: {
          ...state.context,
          selectedWord: word,
          selectedWordRange: { start, end },
        }
      }));
    },

    // Complex actions
    addEntry: (entry) => set((state) => ({
      entries: [entry, ...state.entries],
      currentEntry: entry,
    })),

    updateEntry: (headword, updatedEntry) => set((state) => {
      const updatedEntries = state.entries.map(entry => 
        entry.headword === headword ? updatedEntry : entry
      );
      
      const updatedRecentEntries = state.recentEntries.map(entry =>
        entry.headword === headword ? updatedEntry : entry
      );
      
      return {
        entries: updatedEntries,
        recentEntries: updatedRecentEntries,
        currentEntry: state.currentEntry?.headword === headword ? updatedEntry : state.currentEntry,
      };
    }),

    removeEntry: (headword) => set((state) => ({
      entries: state.entries.filter(entry => entry.headword !== headword),
      currentEntry: state.currentEntry?.headword === headword ? null : state.currentEntry,
      recentEntries: state.recentEntries.filter(entry => entry.headword !== headword),
    })),
  })
);