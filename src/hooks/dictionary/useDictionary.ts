import { useState, useCallback, useRef, useMemo } from 'react';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useApiQueueStore } from '@/stores/apiQueueStore';
import { DictionaryEntry, SearchFilters, ApiResponse, SearchResult } from '@/lib/types';

// Helper function to check if entry matches language settings
const entryMatchesLanguages = (
  entry: DictionaryEntry, 
  sourceLanguage: string, 
  targetLanguage: string
): boolean => {
  return entry.metadata.source_language === sourceLanguage && 
         entry.metadata.target_language === targetLanguage;
};

export function useDictionary() {
  // Access store data with simple selectors to avoid subscription loops
  const entries = useDictionaryStore((state) => state.entries);
  const currentEntry = useDictionaryStore((state) => state.currentEntry);
  const recentEntries = useDictionaryStore((state) => state.recentEntries);
  const searchResults = useDictionaryStore((state) => state.searchResults);
  const searchLoading = useDictionaryStore((state) => state.searchLoading);
  const loading = useDictionaryStore((state) => state.loading);
  const error = useDictionaryStore((state) => state.error);
  const allEntriesLoaded = useDictionaryStore((state) => state.allEntriesLoaded);
  
  // Access store actions
  const setCurrentEntry = useDictionaryStore((state) => state.setCurrentEntry);
  const addToRecentEntries = useDictionaryStore((state) => state.addToRecentEntries);
  const setSearchLoading = useDictionaryStore((state) => state.setSearchLoading);
  const setSearchResults = useDictionaryStore((state) => state.setSearchResults);
  const setLoading = useDictionaryStore((state) => state.setLoading);
  const setError = useDictionaryStore((state) => state.setError);
  const addEntry = useDictionaryStore((state) => state.addEntry);
  const updateEntry = useDictionaryStore((state) => state.updateEntry);
  const removeEntry = useDictionaryStore((state) => state.removeEntry);
  const setAllEntriesLoaded = useDictionaryStore((state) => state.setAllEntriesLoaded);
  const setEntries = useDictionaryStore((state) => state.setEntries);

  // Get current languages - use stable selector
  const languages = useSettingsStore((state) => state.languages);
  
  const { addToQueue, startProcessing, completeRequest, errorRequest } = useApiQueueStore();

  // Loading state management to prevent simultaneous loads
  const loadingRef = useRef({
    isLoadingEntries: false,
    isLoadingChunk: false,
    loadedLanguagePair: '',
  });

  // Set to track loaded entries and prevent duplicates
  const loadedEntriesRef = useRef(new Set<string>());

  /**
   * Filter entries by current language settings - done here to avoid store circular deps
   */
  const getFilteredRecentEntries = useCallback(() => {
    return recentEntries.filter(entry =>
      entryMatchesLanguages(entry, languages.sourceLanguage, languages.targetLanguage)
    );
  }, [recentEntries, languages.sourceLanguage, languages.targetLanguage]);

  const getEntriesForCurrentLanguages = useCallback(() => {
    return entries.filter(entry =>
      entryMatchesLanguages(entry, languages.sourceLanguage, languages.targetLanguage)
    );
  }, [entries, languages.sourceLanguage, languages.targetLanguage]);

  /**
   * Generic async API handler with queue integration
   */
  const processApiRequest = useCallback(<T>(
    requestType: 'create' | 'regenerate' | 'get' | 'delete' | 'lemma',
    word: string,
    apiCall: () => Promise<T>,
    onSuccess?: (result: T) => void,
    onError?: (error: string) => void
  ): string => {
    // Add to queue
    const requestId = addToQueue({
      type: requestType,
      word,
      sourceLanguage: languages.sourceLanguage,
      targetLanguage: languages.targetLanguage,
    });

    // Start processing immediately
    startProcessing(requestId);

    // Fire off the API call in the background (don't await!)
    apiCall()
      .then(result => {
        completeRequest(requestId, result);
        onSuccess?.(result);
      })
      .catch(error => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errorRequest(requestId, errorMessage);
        onError?.(errorMessage);
      });

    // Return immediately with request ID
    return requestId;
  }, [addToQueue, startProcessing, completeRequest, errorRequest, languages]);

  /**
   * Search for entries - this is for filtering the dictionary list (synchronous)
   */
  const searchEntries = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      // If no search term, clear search results and show all entries
      setSearchResults({
        entries: [],
        total: 0,
        page: 1,
        pageSize: 50,
      });
      return;
    }

    setSearchLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/entries/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filters: {
            searchTerm: searchTerm,
            sourceLanguage: languages.sourceLanguage,
            targetLanguage: languages.targetLanguage,
          },
          page: 1,
          pageSize: 100,
        }),
      });

      const result: ApiResponse<SearchResult> = await response.json();

      if (result.success && result.data) {
        setSearchResults(result.data);
      } else {
        setError(result.error || 'Search failed');
      }
    } catch (error) {
      setError('Network error during search');
    } finally {
      setSearchLoading(false);
    }
  }, [languages, setSearchLoading, setSearchResults, setError]);

  /**
   * Get entry by headword - marks as recent only when searched
   */
  const getEntry = useCallback((headword: string, isFromSearch = false): string => {
    const requestId = processApiRequest(
      'get',
      headword,
      async () => {
        const params = new URLSearchParams({
          headword,
          sourceLanguage: languages.sourceLanguage,
          targetLanguage: languages.targetLanguage,
        });

        const response = await fetch(`/api/entries/get?${params}`);
        const result: ApiResponse<DictionaryEntry> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to get entry');
        }

        return result.data;
      },
      (entry) => {
        console.log('Get entry success:', entry.headword);
        setCurrentEntry(entry);
        addToRecentEntries(entry, isFromSearch);
      },
      (error) => {
        console.error('Get entry error:', error);
        setError(error);
      }
    );

    return requestId;
  }, [languages, setCurrentEntry, addToRecentEntries, setError, processApiRequest]);

  /**
   * Create a new entry - handles both standard and context-aware creation
   */
  const createEntry = useCallback((word: string, contextSentence?: string): string => {
    const requestId = processApiRequest(
      'create',
      word,
      async () => {
        const requestBody: any = {
          word,
          sourceLanguage: languages.sourceLanguage,
          targetLanguage: languages.targetLanguage,
        };

        // Add context if provided
        if (contextSentence && contextSentence.trim()) {
          requestBody.contextSentence = contextSentence.trim();
        }

        const response = await fetch('/api/entries/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const result: ApiResponse<DictionaryEntry> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to create entry');
        }

        return result.data;
      },
      (entry) => {
        console.log('Create success:', entry.headword, 
                   entry.metadata.has_context ? '(context-aware)' : '(standard)');
        addEntry(entry);
        setCurrentEntry(entry);
        addToRecentEntries(entry, true);
        
        // Add to loaded entries set to prevent duplicates
        const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
        loadedEntriesRef.current.add(entryKey);
      },
      (error) => {
        console.error('Create error:', error);
        setError(error);
      }
    );

    return requestId;
  }, [languages, addEntry, setCurrentEntry, addToRecentEntries, setError, processApiRequest]);

  /**
   * Create a context-aware entry
   */
  const createContextualEntry = useCallback((word: string, contextSentence: string): string => {
    return createEntry(word, contextSentence);
  }, [createEntry]);

  /**
   * Regenerate an existing entry
   */
  const regenerateEntry = useCallback((headword: string): string => {
    const requestId = processApiRequest(
      'regenerate',
      headword,
      async () => {
        const response = await fetch('/api/entries/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headword,
            sourceLanguage: languages.sourceLanguage,
            targetLanguage: languages.targetLanguage,
          }),
        });

        const result: ApiResponse<DictionaryEntry> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to regenerate entry');
        }

        return result.data;
      },
      (entry) => {
        console.log('Regenerate success:', entry.headword);
        updateEntry(headword, entry);
        setCurrentEntry(entry);
      },
      (error) => {
        console.error('Regenerate error:', error);
        setError(error);
      }
    );

    return requestId;
  }, [languages, updateEntry, setCurrentEntry, setError, processApiRequest]);

  /**
   * Delete an entry
   */
  const deleteEntry = useCallback((headword: string): string => {
    const requestId = processApiRequest(
      'delete',
      headword,
      async () => {
        const response = await fetch('/api/entries/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            headword,
            sourceLanguage: languages.sourceLanguage,
            targetLanguage: languages.targetLanguage,
          }),
        });

        const result: ApiResponse = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete entry');
        }

        return true;
      },
      () => {
        console.log('Delete success:', headword);
        removeEntry(headword);
        if (currentEntry?.headword === headword) {
          setCurrentEntry(null);
        }
        
        // Remove from loaded entries set
        const entryKey = `${headword}-${languages.sourceLanguage}-${languages.targetLanguage}`;
        loadedEntriesRef.current.delete(entryKey);
      },
      (error) => {
        console.error('Delete error:', error);
        setError(error);
      }
    );

    return requestId;
  }, [languages, currentEntry, removeEntry, setCurrentEntry, setError, processApiRequest]);

  /**
   * Load entries with pagination and duplicate prevention - now using API calls
   */
  const loadEntriesPaginated = useCallback(async (page = 1, pageSize = 200, reset = false): Promise<SearchResult> => {
    // Prevent simultaneous loading
    if (loadingRef.current.isLoadingChunk) {
      console.log('Already loading chunk, skipping...');
      return {
        entries: [],
        total: 0,
        page: 1,
        pageSize: 200
      };
    }

    loadingRef.current.isLoadingChunk = true;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/entries/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filters: {
            sourceLanguage: languages.sourceLanguage,
            targetLanguage: languages.targetLanguage,
          },
          page,
          pageSize,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: ApiResponse<SearchResult> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load entries');
      }

      if (reset || page === 1) {
        // Clear tracking set and replace entries for first page or reset
        loadedEntriesRef.current.clear();
        result.data.entries.forEach(entry => {
          const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
          loadedEntriesRef.current.add(entryKey);
        });
        setEntries(result.data.entries);
      } else {
        // Append for subsequent pages, filtering out duplicates
        const newEntries: DictionaryEntry[] = [];
        
        result.data.entries.forEach(entry => {
          const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
          if (!loadedEntriesRef.current.has(entryKey)) {
            loadedEntriesRef.current.add(entryKey);
            newEntries.push(entry);
          }
        });
        
        if (newEntries.length > 0) {
          console.log(`📝 BEFORE setEntries: current entries.length = ${entries.length}`);
          console.log(`📝 Adding ${newEntries.length} new entries`);
          
          // Get current state directly from store to avoid stale closure
          const currentStoreEntries = useDictionaryStore.getState().entries;
          console.log(`📝 Current store entries: ${currentStoreEntries.length}`);
          
          setEntries([...currentStoreEntries, ...newEntries]);
          
          console.log(`Added ${newEntries.length} new entries (filtered ${result.data.entries.length - newEntries.length} duplicates)`);
        } else {
          console.log(`📝 No new entries to add on page ${page}`);
        }
      }

      return result.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error while loading entries';
      setError(errorMessage);
      console.error('Load entries error:', error);
      return {
        entries: [],
        total: 0,
        page: 1,
        pageSize: 200
      };
    } finally {
      setLoading(false);
      loadingRef.current.isLoadingChunk = false;
    }
  }, [setLoading, setError, languages, setEntries]);

  /**
   * Optimized load all entries with chunked loading
   */
  const loadAllEntriesOptimized = useCallback(async () => {
  const languagePair = `${languages.sourceLanguage}-${languages.targetLanguage}`;
  
  // Prevent simultaneous loads and check if already loaded for this language pair
  if (loadingRef.current.isLoadingEntries) {
    console.log('Already loading entries, skipping...');
    return;
  }

  if (loadingRef.current.loadedLanguagePair === languagePair && allEntriesLoaded) {
    console.log('Entries already loaded for current language pair');
    return;
  }

  loadingRef.current.isLoadingEntries = true;
  loadingRef.current.loadedLanguagePair = languagePair;
  
  const CHUNK_SIZE = 200;
  let page = 1;
  let hasMore = true;
  let totalLoaded = 0;
  
  setAllEntriesLoaded(false);
  
  try {
    console.log(`Starting optimized loading for ${languagePair}...`);
    
    while (hasMore && page <= 25) {
      const result = await loadEntriesPaginated(page, CHUNK_SIZE, page === 1);
      
      const actualNewEntries = result.entries.length;
      totalLoaded += actualNewEntries;
      
      // DIAGNOSTIC LOGGING
      console.log(`📊 Page ${page} DEBUG:`, {
        returnedEntries: actualNewEntries,
        totalInDB: result.total,
        chunkSize: CHUNK_SIZE,
        currentTotal: totalLoaded,
        shouldContinue: actualNewEntries === CHUNK_SIZE,
        totalCheck: result.total > page * CHUNK_SIZE
      });
      
      hasMore = actualNewEntries === CHUNK_SIZE && result.total > page * CHUNK_SIZE;
      page++;
      
      if (!hasMore) {
        console.log(`🛑 Stopping because: actualNewEntries(${actualNewEntries}) !== CHUNK_SIZE(${CHUNK_SIZE}) OR total(${result.total}) <= page*chunk(${page * CHUNK_SIZE})`);
      }
    }
    
    setAllEntriesLoaded(true);
    console.log(`Optimized loading completed: ${totalLoaded} entries loaded for ${languagePair}`);
    
  } catch (error) {
    console.error('Error loading entries in chunks:', error);
    setError('Failed to load dictionary entries');
  } finally {
    loadingRef.current.isLoadingEntries = false;
  }
  // Remove entries.length from dependencies since we use refs to track state
}, [loadEntriesPaginated, setAllEntriesLoaded, setError, languages, allEntriesLoaded]);

  /**
   * Reset dictionary when languages change
   */
  const resetForLanguageChange = useCallback(() => {
    console.log('Resetting for language change...');
    
    // Clear loading state
    loadingRef.current.isLoadingEntries = false;
    loadingRef.current.isLoadingChunk = false;
    loadingRef.current.loadedLanguagePair = '';
    
    // Clear duplicate tracking
    loadedEntriesRef.current.clear();
    
    // Reset store state
    setAllEntriesLoaded(false);
    setEntries([]);
    setCurrentEntry(null);
    setSearchResults({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
  }, [setAllEntriesLoaded, setEntries, setCurrentEntry, setSearchResults]);

  return {
    // State
    entries,
    currentEntry,
    recentEntries,
    searchResults,
    searchLoading,
    loading,
    error,
    allEntriesLoaded,

    // Core actions
    searchEntries,
    getEntry,
    createEntry,
    regenerateEntry,
    deleteEntry,
    setCurrentEntry,
    resetForLanguageChange,
    createContextualEntry,

    // Optimized loading actions
    loadEntriesPaginated,
    loadAllEntriesOptimized,
    
    // Keep legacy method for compatibility
    loadAllEntries: loadAllEntriesOptimized,
    
    // Filtered data selectors - these are now safe functions
    getFilteredRecentEntries,
    getEntriesForCurrentLanguages,
  };
}