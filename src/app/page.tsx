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
import { ContextSearch } from '@/components/ContextSearch';
import { useImmediateDebounce } from '@/hooks/shared/useDebounce';
// STEP 1: Settings store ✅
import { useSettingsStore } from '@/stores/settingsStore';
// STEP 2: Dictionary store ✅  
import { useDictionaryStore } from '@/stores/dictionaryStore';
// STEP 3: Dictionary hook ✅
import { useDictionary } from '@/hooks/dictionary/useDictionary';
// STEP 4: Add Anki auto-connect
import { useAnkiAutoConnect } from '@/hooks/useAnkiAutoConnect';

export default function DictionaryPage() {
  console.log('🚀 DictionaryPage rendering - Step 4: Auto-loading effects added');

  // LOCAL STATE
  const [newWord, setNewWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // STEP 4: Use immediate debounce to eliminate typing lag  
  const [searchInput, setSearchInput] = useState('');
  const [, searchTerm] = useImmediateDebounce(searchInput, 300);

  // STEP 4: Refs for tracking initialization to prevent loops
  const hasInitialized = useRef(false);
  const currentLanguagePair = useRef('');

  // STEP 1: Settings store ✅
  const languages = useSettingsStore(useCallback((state) => state.languages, []));
  const updateLanguages = useSettingsStore(useCallback((state) => state.updateLanguages, []));

  // STEP 2: Dictionary store ✅  
  const entries = useDictionaryStore((state) => state.entries);
  const currentEntry = useDictionaryStore((state) => state.currentEntry);
  const searchResults = useDictionaryStore((state) => state.searchResults);
  const loading = useDictionaryStore((state) => state.loading);
  const error = useDictionaryStore((state) => state.error);
  const allEntriesLoaded = useDictionaryStore((state) => state.allEntriesLoaded);
  const context = useDictionaryStore((state) => state.context);
  const clearContext = useDictionaryStore(useCallback((state) => state.clearContext, []));

  // STEP 3: Dictionary hook ✅
  const {
    searchEntries,
    getEntry,
    createEntry,
    regenerateEntry,
    deleteEntry,
    createContextualEntry,
    searchLoading,
    loadAllEntriesOptimized,
    resetForLanguageChange,
    getFilteredRecentEntries,
    getEntriesForCurrentLanguages,
  } = useDictionary();

  // STEP 4: Auto-connect to Anki if previously configured
  useAnkiAutoConnect();

  console.log('🔍 Dictionary store state:');
  console.log('  - Entries count:', entries.length);
  console.log('  - Current entry:', currentEntry?.headword || 'none');
  console.log('  - Loading:', loading);
  console.log('  - All entries loaded:', allEntriesLoaded);
  console.log('  - Search loading:', searchLoading);
  console.log('  - Error:', error);

  // STEP 4: Create stable language pair string for optimization
  const languagePair = useMemo(() => 
    `${languages.sourceLanguage}-${languages.targetLanguage}`, 
    [languages.sourceLanguage, languages.targetLanguage]
  );

  // STEP 4: CRITICAL - Fixed search effect that doesn't cause input lag
  useEffect(() => {
    if (searchTerm.trim()) {
      console.log('🔍 Searching for:', searchTerm);
      searchEntries(searchTerm);
    } else {
      // Clear search results when search term is empty
      searchEntries('');
    }
  }, [searchTerm, searchEntries]);

  // STEP 4: CRITICAL - Single initialization effect with proper dependency management
  useEffect(() => {
  console.log('🔍 Effect RUNNING with deps:', {
    languagePair,
    loading,
    allEntriesLoaded,
    hasInitialized: hasInitialized.current,
    currentPair: currentLanguagePair.current
  });

    const needsInitialization = !hasInitialized.current || 
                               currentLanguagePair.current !== languagePair;
    
    if (needsInitialization && !loading) {
      console.log('🚀 Initializing dictionary for:', languagePair);
      
      hasInitialized.current = true;
      
      // Reset if language pair changed
      if (currentLanguagePair.current !== languagePair) {
        console.log('🌐 Language pair changed, resetting...');
        currentLanguagePair.current = languagePair;
        resetForLanguageChange();
      }
      
      // Load entries if not already loaded
      if (!allEntriesLoaded) {
        console.log('📚 Loading entries...');
        setTimeout(() => {
          loadAllEntriesOptimized();
        }, 0);
      }
    }
  }, [languagePair, loading, allEntriesLoaded, resetForLanguageChange, loadAllEntriesOptimized]);

  // STEP 4: Optimized filtering with proper memoization and language filtering
  const { filteredEntries, recentEntries } = useMemo(() => {
    const filtered = getEntriesForCurrentLanguages();
    const recent = getFilteredRecentEntries();

    return { filteredEntries: filtered, recentEntries: recent };
  }, [getEntriesForCurrentLanguages, getFilteredRecentEntries]);

  // STEP 4: Get entries to display based on search with memoization
  const entriesToShow = useMemo(() => {
    return searchTerm.trim() ? searchResults.entries : filteredEntries;
  }, [searchTerm, searchResults.entries, filteredEntries]);

  console.log('📊 Computed data:');
  console.log('  - Filtered entries:', filteredEntries.length);
  console.log('  - Recent entries:', recentEntries.length);
  console.log('  - Entries to show:', entriesToShow.length);
  console.log('  - Language pair:', languagePair);
  console.log('  - Has initialized:', hasInitialized.current);

  // STEP 3: REAL HANDLERS ✅
  const handleSearchEntry = useCallback((headword: string) => {
    console.log('🔍 Search entry clicked:', headword);
    getEntry(headword, false); // Don't mark as searched
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

  // STEP 4: Real language change handler with reset
  const handleLanguageChange = useCallback((type: 'source' | 'target', value: string) => {
    console.log('🌐 Language change triggered:', type, value);
    
    if (type === 'source') {
      updateLanguages({ sourceLanguage: value });
    } else {
      updateLanguages({ targetLanguage: value });
    }
    
    // Reset initialization flag so the effect can run again
    hasInitialized.current = false;
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel */}
          <div className="space-y-4">
            {/* STEP 4: Recent Lookups - FIXED: Only show for current language */}
            {recentEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center">
                    <History className="h-5 w-5 mr-2" />
                    Recent ({recentEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {recentEntries.map((entry, index) => (
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

            {/* STEP 4: Search with immediate response - no lag */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Filter Dictionary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter entries..."
                    value={searchInput} // Immediate value - no lag!
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

            {/* Dictionary Entries List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <BookOpen className="h-5 w-5 mr-2" />
                  Dictionary ({filteredEntries.length} entries)
                </CardTitle>
                {searchTerm.trim() && (
                  <p className="text-sm text-muted-foreground">
                    Showing {entriesToShow.length} filtered results
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {loading && !allEntriesLoaded && (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      Loading dictionary... ({filteredEntries.length} loaded)
                    </div>
                  )}
                  
                  {entriesToShow.length > 0 ? (
                    entriesToShow.map((entry, index) => (
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
                    ))
                  ) : allEntriesLoaded && !loading ? (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      {searchTerm.trim() ? 'No entries found matching your search.' : 'No entries yet for this language combination.'}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center Panel - Entry Display */}
          <div className="lg:col-span-2">
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
                                
                                <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
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

            {/* Add new word */}
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

            {/* Context-Aware Search */}
            <div className="mt-6">
              <ContextSearch
                onWordSelect={handleWordSelectFromContext}
                onContextualSearch={handleContextualSearch}
              />
            </div>
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