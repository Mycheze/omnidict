'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Search, BookOpen, Settings, History, ArrowRight, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ApiQueueStatus } from '@/components/ApiQueueStatus';
import { SettingsModal } from '@/components/SettingsModal';
import { AnkiExportButton } from '@/components/anki/AnkiExportButton';
import { AnkiUpdateButton } from '@/components/anki/AnkiUpdateButton';
import { ContextSearch } from '@/components/ContextSearch';
import { PaginationGrid } from '@/components/PaginationGrid';
import { useImmediateDebounce } from '@/hooks/shared/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useDictionary } from '@/hooks/dictionary/useDictionary';
import { useAnkiAutoConnect } from '@/hooks/useAnkiAutoConnect';

export default function DictionaryPage() {
  console.log('🚀 DictionaryPage rendering');

  // LOCAL STATE
  const [newWord, setNewWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Use immediate debounce to eliminate typing lag  
  const [searchInput, setSearchInput] = useState('');
  const [, searchTerm] = useImmediateDebounce(searchInput, 300);

  // Track current language pair for change detection
  const currentLanguageRef = useRef('');

  // Settings store
  const languages = useSettingsStore(useCallback((state) => state.languages, []));
  const updateLanguages = useSettingsStore(useCallback((state) => state.updateLanguages, []));

  // Dictionary store  
  const currentEntry = useDictionaryStore((state) => state.currentEntry);
  const searchResults = useDictionaryStore((state) => state.searchResults);
  const loading = useDictionaryStore((state) => state.loading);
  const error = useDictionaryStore((state) => state.error);
  const context = useDictionaryStore((state) => state.context);
  const clearContext = useDictionaryStore(useCallback((state) => state.clearContext, []));
  const setSearchResults = useDictionaryStore((state) => state.setSearchResults);
  const entries = useDictionaryStore((state) => state.entries);
  const recentEntries = useDictionaryStore((state) => state.recentEntries);

  // Dictionary hook
  const {
    searchEntries,
    getEntry,
    createEntry,
    regenerateEntry,
    deleteEntry,
    createContextualEntry,
    searchLoading,
    getFilteredRecentEntries,
    getEntriesForCurrentLanguages,
    loadEntriesPaginated,
    loadPaginationIndex,
    resetForLanguageChange,
    totalEntries,
  } = useDictionary();

  // Auto-connect to Anki
  useAnkiAutoConnect();

  // Create stable language pair string
  const languagePair = useMemo(() => 
    `${languages.sourceLanguage}-${languages.targetLanguage}`, 
    [languages.sourceLanguage, languages.targetLanguage]
  );

  // Load entries when language changes (including initial mount)
  useEffect(() => {
    console.log('🌐 Language pair check:', currentLanguageRef.current, '→', languagePair);
    if (currentLanguageRef.current !== languagePair) {
      console.log('🔄 Loading entries for:', languagePair);
      currentLanguageRef.current = languagePair;
      
      // Load initial entries for new language pair
      resetForLanguageChange();
      loadEntriesPaginated(1, 50, true);
      loadPaginationIndex();
    }
  }, [languagePair, loadEntriesPaginated, resetForLanguageChange, loadPaginationIndex]);

  // Search effect - only filter when there's a search term
  useEffect(() => {
    if (searchTerm.trim()) {
      console.log('🔍 Searching for:', searchTerm);
      searchEntries(searchTerm);
    } else {
      // Clear search results to show all loaded entries
      console.log('🔍 Clearing search - showing all entries');
      setSearchResults({
        entries: [],
        total: 0,
        page: 1,
        pageSize: 50,
      });
    }
  }, [searchTerm, searchEntries, setSearchResults]);

  // Get current entries and recent entries
  // Note: getFilteredRecentEntries now internally checks language to be safe, though store might have mixed
  // We use useMemo to avoid recalculating on every render unless deps change
  const filteredRecentEntries = useMemo(() => {
    return getFilteredRecentEntries();
  }, [getFilteredRecentEntries]);

  // Get entries to display based on search
  const entriesToShow = useMemo(() => {
    // If there is a search term, show search results
    // Otherwise show the loaded entries list (pagination)
    return searchTerm.trim() ? searchResults.entries : entries;
  }, [searchTerm, searchResults.entries, entries]);

  // Handler for Load More
  const handleLoadMoreEntries = useCallback(async () => {
    if (!loading) {
      console.log('📚 Loading more entries...');
      // Calculate NEXT page based on current entries count
      // If we have 50 entries, we played page 1. We want page 2.
      // Math.ceil(50 / 50) + 1 = 1 + 1 = 2.
      // If we have 100 entries, we want page 3.
      const nextPage = Math.ceil(entries.length / 50) + 1;
      await loadEntriesPaginated(nextPage, 50, false);
    }
  }, [loading, entries.length, loadEntriesPaginated]);

  console.log('📊 Current state:');
  console.log('  - Language pair:', languagePair);
  console.log('  - Loaded entries:', entries.length);
  console.log('  - Recent entries:', filteredRecentEntries.length);
  console.log('  - Entries to show:', entriesToShow.length);

  // HANDLERS
  const handleSearchEntry = useCallback((headword: string) => {
    console.log('🔍 Search entry clicked:', headword);
    getEntry(headword, false);
  }, [getEntry]);

  const handleCreateNewEntry = useCallback(() => {
    if (!newWord.trim()) return;
    console.log('➕ Creating new entry:', newWord);
    setIsSubmitting(true);
    const wordToCreate = newWord.trim();
    setNewWord('');
    
    createEntry(wordToCreate);
    setTimeout(() => setIsSubmitting(false), 500);
  }, [newWord, createEntry]);

  const handleWordSelectFromContext = useCallback((word: string) => {
    setNewWord(word);
  }, []);

  const handleContextualSearch = useCallback((word: string, contextSentence: string) => {
    console.log('🎯 Contextual search:', word, 'in context:', contextSentence);
    setIsSubmitting(true);
    setNewWord('');
    
    createContextualEntry(word, contextSentence);
    clearContext();
    
    setTimeout(() => setIsSubmitting(false), 500);
  }, [createContextualEntry, clearContext]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNewEntry();
    }
  }, [handleCreateNewEntry]);

  const handleLanguageChange = useCallback((type: 'source' | 'target', value: string) => {
    console.log('🌐 Language change triggered:', type, value);
    
    if (type === 'source') {
      updateLanguages({ sourceLanguage: value });
    } else {
      updateLanguages({ targetLanguage: value });
    }
  }, [updateLanguages]);

  const handleRegenerateEntry = useCallback(() => {
    if (currentEntry) {
      console.log('🔄 Regenerating entry:', currentEntry.headword);
      regenerateEntry(currentEntry.headword);
    }
  }, [currentEntry, regenerateEntry]);

  const handleDeleteEntry = useCallback(() => {
    if (currentEntry) {
      console.log('🗑️ Deleting entry:', currentEntry.headword);
      deleteEntry(currentEntry.headword);
    }
  }, [currentEntry, deleteEntry]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
  }, []);

  const darkMode = useSettingsStore((state) => state.preferences.darkMode);
  const updatePreferences = useSettingsStore((state) => state.updatePreferences);

  // Apply dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Omnidict</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <LanguageSelector
              label="Base"
              value={languages.sourceLanguage}
              type="source"
              onChange={(value) => handleLanguageChange('source', value)}
            />
            
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            
            <LanguageSelector
              label="Target"
              value={languages.targetLanguage}
              type="target"
              onChange={(value) => handleLanguageChange('target', value)}
            />

            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => updatePreferences({ darkMode: !darkMode })}
              title="Toggle dark mode"
            >
              {darkMode ? '☀️' : '🌙'}
            </Button>

            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Mobile-first layout: Entry content first, then search components, then lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Entry Display Area - Shows first on mobile, spans 2 cols on desktop */}
          <div className="lg:col-span-2 lg:order-2">
            {error && (
              <Card className="mb-4 border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {currentEntry ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="dictionary-entry">
                    {/* Language info with context indicator */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">
                        {currentEntry.metadata.source_language} → {currentEntry.metadata.target_language}
                      </div>
                      {currentEntry.metadata.has_context && (
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-green-600" />
                          <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                            Context Aware
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Headword */}
                    <h2 className="dictionary-headword">{currentEntry.headword}</h2>
                    
                    {/* Part of speech */}
                    <p className="dictionary-pos">
                      ({Array.isArray(currentEntry.part_of_speech) 
                        ? currentEntry.part_of_speech.join(', ')
                        : currentEntry.part_of_speech})
                    </p>

                    {/* Meanings */}
                    <div className="space-y-6">
                      {currentEntry.meanings.map((meaning, index) => (
                        <div key={`meaning-${index}`} className="space-y-3">
                          <div className="dictionary-definition">
                            {index + 1}. {meaning.definition}
                          </div>

                          {/* Grammar info */}
                          {(meaning.grammar.noun_type || meaning.grammar.verb_type || meaning.grammar.comparison) && (
                            <div className="flex flex-wrap gap-2">
                              {meaning.grammar.noun_type && (
                                <span className="dictionary-grammar">
                                  {meaning.grammar.noun_type}
                                </span>
                              )}
                              {meaning.grammar.verb_type && (
                                <span className="dictionary-grammar">
                                  {meaning.grammar.verb_type}
                                </span>
                              )}
                              {meaning.grammar.comparison && (
                                <span className="dictionary-grammar">
                                  {meaning.grammar.comparison}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Examples with Export Buttons */}
                          {meaning.examples.map((example, exampleIndex) => (
                            <div key={`example-${index}-${exampleIndex}`} className={`dictionary-example relative group ${
                              example.is_context_sentence ? 'bg-green-100 border-green-300' : ''
                            }`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    {example.is_context_sentence && (
                                      <Sparkles className="h-3 w-3 text-green-600 flex-shrink-0" />
                                    )}
                                    <div>{example.sentence}</div>
                                  </div>
                                  {example.translation && (
                                    <div className="dictionary-translation">
                                      {example.translation}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                  <AnkiExportButton
                                    context={{
                                      headword: currentEntry.headword,
                                      definition: meaning.definition,
                                      partOfSpeech: currentEntry.part_of_speech,
                                      example: example.sentence,
                                      translation: example.translation,
                                    }}
                                    className="shrink-0"
                                  />
                                  <AnkiUpdateButton
                                    context={{
                                      headword: currentEntry.headword,
                                      definition: meaning.definition,
                                      partOfSpeech: currentEntry.part_of_speech,
                                      example: example.sentence,
                                      translation: example.translation,
                                    }}
                                    className="shrink-0"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-6 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleRegenerateEntry}
                      >
                        🔄 Regenerate
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleDeleteEntry}
                      >
                        🗑️ Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No entry selected</h3>
                    <p>Click on an entry from the dictionary list, use context-aware search, or create a new one below.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add new word - appears after entry on mobile */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Add New Word</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter a new word to add..."
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                  <Button 
                    onClick={handleCreateNewEntry}
                    disabled={!newWord.trim() || isSubmitting}
                    className={isSubmitting ? 'bg-green-500 hover:bg-green-600' : ''}
                  >
                    {isSubmitting ? '✓ Added' : 'Add'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Learning: {languages.sourceLanguage} → {languages.targetLanguage}
                </p>
              </CardContent>
            </Card>

            {/* Context-Aware Search - appears after add word on mobile */}
            <div className="mt-6">
              <ContextSearch
                onWordSelect={handleWordSelectFromContext}
                onContextualSearch={handleContextualSearch}
              />
            </div>
          </div>

          {/* Search & Lists Panel - Shows after entry content on mobile, first column on desktop */}
          <div className="space-y-4 lg:order-1">
            
            {/* Filter Dictionary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Filter Dictionary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter entries..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10"
                  />
                  {searchInput.trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSearch}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                      title="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                
                {searchLoading && (
                  <div className="mt-4 text-sm text-muted-foreground">
                    Searching...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Lookups */}
            {filteredRecentEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <History className="h-5 w-5 mr-2" />
                    Recent ({filteredRecentEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {filteredRecentEntries.map((entry, index) => (
                      <button
                        key={`recent-${entry.headword}-${index}`}
                        onClick={() => handleSearchEntry(entry.headword)}
                        className="w-full text-left p-2 rounded hover:bg-muted transition-colors border-l-2 border-primary bg-primary/5"
                      >
                        <div className="font-medium">{entry.headword}</div>
                        <div className="text-xs text-muted-foreground">
                          {Array.isArray(entry.part_of_speech) 
                            ? entry.part_of_speech.join(', ')
                            : entry.part_of_speech}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dictionary Entries List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <BookOpen className="h-5 w-5 mr-2" />
                  Dictionary ({searchTerm.trim() ? searchResults.total : totalEntries})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-96 overflow-y-auto dictionary-list-top">
                  {entriesToShow.length > 0 ? (
                    <>
                      {entriesToShow.map((entry, index) => (
                        <button
                          key={`entry-${entry.headword}-${index}`}
                          onClick={() => handleSearchEntry(entry.headword)}
                          className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                        >
                          <div className="font-medium">{entry.headword}</div>
                          <div className="text-xs text-muted-foreground">
                            {Array.isArray(entry.part_of_speech) 
                              ? entry.part_of_speech.join(', ')
                              : entry.part_of_speech}
                          </div>
                        </button>
                      ))}
                      
                      {/* Pagination Grid (Replacing Load More) */}
                      {!searchTerm.trim() && !loading && (
                        <div className="pt-8 border-t mt-4">
                          <PaginationGrid
                            pages={searchResults.paginationIndex || []}
                            currentPage={searchResults.page}
                            onPageSelect={(page) => {
                              console.log('📄 Jumping to page:', page);
                              loadEntriesPaginated(page, 50, true); // true = reset (replace) entries
                              // Scroll to top of list
                              const listTop = document.querySelector('.dictionary-list-top');
                              if (listTop) listTop.scrollTop = 0;
                            }}
                          />
                          
                          {/* Fallback Load More if grid is empty/fails, or just small number of entries */}
                          {(!searchResults.paginationIndex || searchResults.paginationIndex.length <= 1) && entries.length < totalEntries && (
                             <Button
                              variant="outline"
                              size="sm"
                              onClick={handleLoadMoreEntries}
                              className="w-full mt-4"
                            >
                              Load More Entries
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  ) : loading ? (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      Loading entries...
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      {searchTerm.trim() ? 'No entries found matching your search.' : 'No entries yet for this language combination.'}
                    </div>
                  )}

                  {/* Search Results Count (Footer) */}
                  {searchTerm.trim() && entriesToShow.length > 0 && (
                    <div className="pt-4 text-center text-sm text-muted-foreground border-t mt-4">
                       Found {searchResults.total} results
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* API Queue Status and Settings Modal */}
      <ApiQueueStatus />
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}