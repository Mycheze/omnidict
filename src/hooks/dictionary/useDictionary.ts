import { useState, useCallback, useRef, useMemo } from "react";
import { useDictionaryStore } from "@/stores/dictionaryStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useApiQueueStore } from "@/stores/apiQueueStore";
import { useAIStore } from "@/stores/aiStore";
import {
  DictionaryEntry,
  SearchFilters,
  ApiResponse,
  SearchResult,
} from "@/lib/types";

export function useDictionary() {
  // Access store data with simple selectors to avoid subscription loops
  const entries = useDictionaryStore((state) => state.entries);
  const totalEntries = useDictionaryStore((state) => state.totalEntries);
  const currentEntry = useDictionaryStore((state) => state.currentEntry);
  const recentEntries = useDictionaryStore((state) => state.recentEntries);
  const searchResults = useDictionaryStore((state) => state.searchResults);
  const searchLoading = useDictionaryStore((state) => state.searchLoading);
  const loading = useDictionaryStore((state) => state.loading);
  const error = useDictionaryStore((state) => state.error);

  // Access store actions
  const setCurrentEntry = useDictionaryStore((state) => state.setCurrentEntry);
  const addToRecentEntries = useDictionaryStore(
    (state) => state.addToRecentEntries,
  );
  const setSearchLoading = useDictionaryStore(
    (state) => state.setSearchLoading,
  );
  const setSearchResults = useDictionaryStore(
    (state) => state.setSearchResults,
  );
  const setLoading = useDictionaryStore((state) => state.setLoading);
  const setError = useDictionaryStore((state) => state.setError);
  const addEntry = useDictionaryStore((state) => state.addEntry);
  const updateEntry = useDictionaryStore((state) => state.updateEntry);
  const removeEntry = useDictionaryStore((state) => state.removeEntry);
  const setEntries = useDictionaryStore((state) => state.setEntries);
  const setTotalEntries = useDictionaryStore((state) => state.setTotalEntries);

  // Get current languages - use stable selector
  const languages = useSettingsStore((state) => state.languages);

  // Get AI settings - use stable selector
  const selectedProvider = useAIStore((state) => state.selectedProvider);
  const apiKeys = useAIStore((state) => state.apiKeys);
  const selectedModels = useAIStore((state) => state.selectedModels);

  const { addToQueue, startProcessing, completeRequest, errorRequest } =
    useApiQueueStore();

  // Loading state management
  const loadingRef = useRef({
    isLoadingChunk: false,
  });

  // Set to track loaded entries and prevent duplicates
  const loadedEntriesRef = useRef(new Set<string>());

  /**
   * Generic async API handler with queue integration
   */
  const processApiRequest = useCallback(
    <T>(
      requestType: "create" | "regenerate" | "get" | "delete" | "lemma",
      word: string,
      apiCall: () => Promise<T>,
      onSuccess?: (result: T) => void,
      onError?: (error: string) => void,
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
        .then((result) => {
          completeRequest(requestId, result);
          onSuccess?.(result);
        })
        .catch((error) => {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          errorRequest(requestId, errorMessage);
          onError?.(errorMessage);
        });

      // Return immediately with request ID
      return requestId;
    },
    [addToQueue, startProcessing, completeRequest, errorRequest, languages],
  );

  /**
   * Search for entries - this is for filtering the dictionary list (server-side)
   */
  const searchEntries = useCallback(
    async (searchTerm: string) => {
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
        const response = await fetch("/api/entries/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              searchTerm: searchTerm,
              sourceLanguage: languages.sourceLanguage,
              targetLanguage: languages.targetLanguage,
            },
            page: 1,
            pageSize: 50,
          }),
        });

        const result: ApiResponse<SearchResult> = await response.json();

        if (result.success && result.data) {
          setSearchResults(result.data);
        } else {
          setError(result.error || "Search failed");
        }
      } catch (error) {
        setError("Network error during search");
      } finally {
        setSearchLoading(false);
      }
    },
    [languages, setSearchLoading, setSearchResults, setError],
  );

  /**
   * Get entry by headword - marks as recent only when searched
   */
  const getEntry = useCallback(
    (headword: string, isFromSearch = false): string => {
      const requestId = processApiRequest(
        "get",
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
            throw new Error(result.error || "Failed to get entry");
          }

          return result.data;
        },
        (entry) => {
          setCurrentEntry(entry);
          addToRecentEntries(entry, isFromSearch);
        },
        (error) => {
          console.error("Get entry error:", error);
          setError(error);
        },
      );

      return requestId;
    },
    [
      languages,
      setCurrentEntry,
      addToRecentEntries,
      setError,
      processApiRequest,
    ],
  );

  /**
   * Create a new entry - handles both standard and context-aware creation
   */
  const createEntry = useCallback(
    (word: string, contextSentence?: string): string => {
      const requestId = processApiRequest(
        "create",
        word,
        async () => {
          const requestBody = {
            word,
            sourceLanguage: languages.sourceLanguage,
            targetLanguage: languages.targetLanguage,
            contextSentence: contextSentence?.trim() || undefined,
            providerType: selectedProvider,
            apiKey: apiKeys[selectedProvider],
            model: selectedModels[selectedProvider],
          };

          const response = await fetch("/api/entries/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          const result: ApiResponse<DictionaryEntry> = await response.json();

          if (!result.success || !result.data) {
            throw new Error(result.error || "Failed to create entry");
          }

          return result.data;
        },
        (entry) => {
          addEntry(entry);
          setCurrentEntry(entry);
          addToRecentEntries(entry, true);

          // Add to loaded entries set to prevent duplicates
          const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
          loadedEntriesRef.current.add(entryKey);
        },
        (error) => {
          console.error("Create error:", error);
          setError(error);
        },
      );

      return requestId;
    },
    [
      languages,
      selectedProvider,
      apiKeys,
      selectedModels,
      addEntry,
      setCurrentEntry,
      addToRecentEntries,
      setError,
      processApiRequest,
    ],
  );

  /**
   * Create a context-aware entry
   */
  const createContextualEntry = useCallback(
    (word: string, contextSentence: string): string => {
      return createEntry(word, contextSentence);
    },
    [createEntry],
  );

  /**
   * Regenerate an existing entry
   */
  const regenerateEntry = useCallback(
    (headword: string): string => {
      const requestId = processApiRequest(
        "regenerate",
        headword,
        async () => {
          const response = await fetch("/api/entries/regenerate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              headword,
              sourceLanguage: languages.sourceLanguage,
              targetLanguage: languages.targetLanguage,
              // Add AI configuration from settings
              providerType: selectedProvider,
              apiKey: apiKeys[selectedProvider],
              model: selectedModels[selectedProvider],
            }),
          });

          const result: ApiResponse<DictionaryEntry> = await response.json();

          if (!result.success || !result.data) {
            throw new Error(result.error || "Failed to regenerate entry");
          }

          return result.data;
        },
        (entry) => {
          updateEntry(headword, entry);
          setCurrentEntry(entry);
        },
        (error) => {
          console.error("Regenerate error:", error);
          setError(error);
        },
      );

      return requestId;
    },
    [
      languages,
      selectedProvider,
      apiKeys,
      selectedModels,
      updateEntry,
      setCurrentEntry,
      setError,
      processApiRequest,
    ],
  );

  /**
   * Delete an entry
   */
  const deleteEntry = useCallback(
    (headword: string): string => {
      const requestId = processApiRequest(
        "delete",
        headword,
        async () => {
          const response = await fetch("/api/entries/delete", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              headword,
              sourceLanguage: languages.sourceLanguage,
              targetLanguage: languages.targetLanguage,
            }),
          });

          const result: ApiResponse = await response.json();

          if (!result.success) {
            throw new Error(result.error || "Failed to delete entry");
          }

          return true;
        },
        () => {
          removeEntry(headword);
          if (currentEntry?.headword === headword) {
            setCurrentEntry(null);
          }

          // Remove from loaded entries set
          const entryKey = `${headword}-${languages.sourceLanguage}-${languages.targetLanguage}`;
          loadedEntriesRef.current.delete(entryKey);
        },
        (error) => {
          console.error("Delete error:", error);
          setError(error);
        },
      );

      return requestId;
    },
    [
      languages,
      currentEntry,
      removeEntry,
      setCurrentEntry,
      setError,
      processApiRequest,
    ],
  );

  /**
   * Load entries paginated - Simple implementation that trusts the API
   */
  const loadEntriesPaginated = useCallback(
    async (page = 1, pageSize = 50, reset = false): Promise<SearchResult> => {
      // Prevent simultaneous loading
      if (loadingRef.current.isLoadingChunk) {
        return { entries: [], total: 0, page: 1, pageSize };
      }

      loadingRef.current.isLoadingChunk = true;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/entries/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          throw new Error(result.error || "Failed to load entries");
        }

        if (reset || page === 1) {
          // Clear tracking set and replace entries for first page or reset
          loadedEntriesRef.current.clear();
          result.data.entries.forEach((entry) => {
            const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
            loadedEntriesRef.current.add(entryKey);
          });
          setEntries(result.data.entries);
          setTotalEntries(result.data.total); // Update total count
        } else {
          // Append for subsequent pages, filtering out duplicates
          const newEntries: DictionaryEntry[] = [];

          result.data.entries.forEach((entry) => {
            const entryKey = `${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`;
            if (!loadedEntriesRef.current.has(entryKey)) {
              loadedEntriesRef.current.add(entryKey);
              newEntries.push(entry);
            }
          });

          if (newEntries.length > 0) {
            // Get current state directly from store to avoid stale closure
            const currentStoreEntries = useDictionaryStore.getState().entries;
            setEntries([...currentStoreEntries, ...newEntries]);
          }
          // Always update total even on append, in case it changed
          // Always update total even on append, in case it changed
          setTotalEntries(result.data.total);
        }

        // Update pagination state
        setSearchResults({
          ...useDictionaryStore.getState().searchResults,
          page,
          total: result.data.total,
        });

        return result.data;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Network error while loading entries";
        setError(errorMessage);
        console.error("Load entries error:", error);
        return { entries: [], total: 0, page, pageSize };
      } finally {
        setLoading(false);
        loadingRef.current.isLoadingChunk = false;
      }
    },
    [
      setLoading,
      setError,
      languages,
      setEntries,
      setTotalEntries,
      setSearchResults,
    ],
  );

  /**
   * Load pagination index for current filters
   */
  const loadPaginationIndex = useCallback(async () => {
    try {
      const response = await fetch("/api/dictionary/pagination-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLanguage: languages.sourceLanguage,
          targetLanguage: languages.targetLanguage,
          searchTerm:
            useDictionaryStore.getState().searchResults.total > 0
              ? undefined
              : undefined, // TODO: handle search term if needed, for now main list
        }),
      });

      if (!response.ok) throw new Error("Failed to load pagination index");
      const result = await response.json();

      if (result.success) {
        setSearchResults({
          ...useDictionaryStore.getState().searchResults,
          paginationIndex: result.data,
        });
      }
    } catch (error) {
      console.error("Error loading pagination index:", error);
    }
  }, [languages, setSearchResults]);

  /**
   * Reset dictionary when languages change
   */
  const resetForLanguageChange = useCallback(() => {
    // Clear loading state
    loadingRef.current.isLoadingChunk = false;

    // Clear duplicate tracking
    loadedEntriesRef.current.clear();

    // Reset store state
    setEntries([]);
    setCurrentEntry(null);
    setSearchResults({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
  }, [setEntries, setCurrentEntry, setSearchResults]);

  /**
   * Helper to get recent entries filtered by current language pair
   */
  const getFilteredRecentEntries = useCallback(() => {
    return recentEntries.filter(
      (entry) =>
        entry.metadata.source_language === languages.sourceLanguage &&
        entry.metadata.target_language === languages.targetLanguage,
    );
  }, [recentEntries, languages]);

  /**
   * Helper to get entries for current language (already filtered by loader, but for consistency)
   */
  const getEntriesForCurrentLanguages = useCallback(() => {
    return entries;
  }, [entries]);

  return {
    // State
    entries,
    totalEntries,
    currentEntry,
    recentEntries,
    searchResults,
    searchLoading,
    loading,
    error,

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
    loadPaginationIndex,

    // Helpers
    getFilteredRecentEntries,
    getEntriesForCurrentLanguages,
  };
}
