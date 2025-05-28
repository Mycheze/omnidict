import { useState, useCallback } from 'react';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useApiQueueStore } from '@/stores/apiQueueStore';
import { DictionaryEntry, SearchFilters, ApiResponse } from '@/lib/types';

export function useDictionary() {
  const {
    entries,
    currentEntry,
    recentEntries,
    searchResults,
    searchLoading,
    loading,
    error,
    allEntriesLoaded,
    setCurrentEntry,
    addToRecentEntries,
    setSearchLoading,
    setSearchResults,
    setLoading,
    setError,
    addEntry,
    updateEntry,
    removeEntry,
    loadAllEntries,
    setAllEntriesLoaded,
    setEntries,
  } = useDictionaryStore();

  const { languages } = useSettingsStore();
  const { addToQueue, startProcessing, completeRequest, errorRequest } = useApiQueueStore();

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

      const result: ApiResponse = await response.json();

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
        console.log('Get entry success callback:', entry.headword);
        setCurrentEntry(entry);
        addToRecentEntries(entry, isFromSearch);
      },
      (error) => {
        console.error('Get entry error callback:', error);
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
        console.log('Create success callback:', entry.headword, 
                   entry.metadata.has_context ? '(context-aware)' : '(standard)');
        addEntry(entry);
        setCurrentEntry(entry);
        addToRecentEntries(entry, true);
      },
      (error) => {
        console.error('Create error callback:', error);
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
        console.log('Regenerate success callback:', entry.headword);
        updateEntry(headword, entry);
        setCurrentEntry(entry);
      },
      (error) => {
        console.error('Regenerate error callback:', error);
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
        console.log('Delete success callback:', headword);
        removeEntry(headword);
        if (currentEntry?.headword === headword) {
          setCurrentEntry(null);
        }
      },
      (error) => {
        console.error('Delete error callback:', error);
        setError(error);
      }
    );

    return requestId;
  }, [languages, currentEntry, removeEntry, setCurrentEntry, setError, processApiRequest]);

  /**
   * Get lemma for a word
   */
  const getLemma = useCallback((word: string): string => {
    const requestId = processApiRequest(
      'lemma',
      word,
      async () => {
        const response = await fetch('/api/lemma', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word,
            targetLanguage: languages.targetLanguage,
          }),
        });

        const result: ApiResponse<{ lemma: string }> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to get lemma');
        }

        return result.data.lemma;
      }
    );

    return requestId;
  }, [languages.targetLanguage, processApiRequest]);

  /**
   * Reset dictionary when languages change
   */
  const resetForLanguageChange = useCallback(() => {
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

    // Actions - now async and queued
    searchEntries,
    getEntry,
    createEntry,
    regenerateEntry,
    deleteEntry,
    getLemma,
    setCurrentEntry,
    loadAllEntries,
    resetForLanguageChange,
    createContextualEntry,
  };
}