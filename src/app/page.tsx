'use client';

import { useState, useEffect } from 'react';
import { Search, BookOpen, Settings, History, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSelector } from '@/components/LanguageSelector';
import { ApiQueueStatus } from '@/components/ApiQueueStatus';
import { SettingsModal } from '@/components/SettingsModal';
import { AnkiExportButton } from '@/components/anki/AnkiExportButton';
import { useDictionary } from '@/hooks/useDictionary';
import { useDebounce } from '@/hooks/useDebounce';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDictionaryStore } from '@/stores/dictionaryStore';
import { useAnkiAutoConnect } from '@/hooks/useAnkiAutoConnect';
import { ContextSearch } from '@/components/ContextSearch';

export default function DictionaryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [newWord, setNewWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const { languages, updateLanguages } = useSettingsStore();
  const { context, clearContext } = useDictionaryStore(); // Add clearContext here
  
  const {
    entries,
    currentEntry,
    recentEntries,
    searchResults,
    searchLoading,
    loading,
    error,
    allEntriesLoaded,
    searchEntries,
    getEntry,
    createEntry,
    createContextualEntry,
    regenerateEntry,
    deleteEntry,
    loadAllEntries,
    resetForLanguageChange,
  } = useDictionary();

  // Auto-connect to Anki if previously configured
  useAnkiAutoConnect();

  // Debounce search term for auto-search
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load all entries when component mounts
  useEffect(() => {
    if (!allEntriesLoaded) {
      loadAllEntries();
    }
  }, [loadAllEntries, allEntriesLoaded]);

  // Handle language changes
  useEffect(() => {
    resetForLanguageChange();
    loadAllEntries();
  }, [languages.sourceLanguage, languages.targetLanguage, resetForLanguageChange, loadAllEntries]);

  // Auto-search when debounced term changes
  useEffect(() => {
    searchEntries(debouncedSearchTerm);
  }, [debouncedSearchTerm, searchEntries]);

  const handleSearchEntry = (headword: string, isFromSearch = false) => {
    getEntry(headword, isFromSearch);
    if (isFromSearch) {
      setSearchTerm(''); // Clear search term if it was from search
    }
  };

  const handleCreateNewEntry = () => {
    if (!newWord.trim()) return;
    
    // Visual feedback
    setIsSubmitting(true);
    
    // Clear input immediately for better UX
    const wordToCreate = newWord.trim();
    setNewWord('');
    setSearchTerm('');
    
    // Create the entry (async via queue)
    createEntry(wordToCreate);
    
    // Reset submit state after a short delay
    setTimeout(() => setIsSubmitting(false), 500);
  };

  // Context-aware word selection - puts word in the regular input
  const handleWordSelectFromContext = (word: string) => {
    setNewWord(word);
  };

  // Context-aware search - creates entry and clears context
  const handleContextualSearch = (word: string, contextSentence: string) => {
    // Visual feedback
    setIsSubmitting(true);
    
    // Clear inputs
    setNewWord('');
    setSearchTerm('');
    
    // Create contextual entry
    createContextualEntry(word, contextSentence);
    
    // Clear the context sentence after search
    clearContext();
    
    // Reset submit state after a short delay
    setTimeout(() => setIsSubmitting(false), 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNewEntry();
    }
  };

  // Filter entries based on current language settings
  const filteredEntries = entries.filter(entry => 
    entry.metadata.source_language === languages.sourceLanguage &&
    entry.metadata.target_language === languages.targetLanguage
  );

  // Get entries to display based on search
  const entriesToShow = searchTerm.trim() ? searchResults.entries : filteredEntries;

  const handleLanguageChange = (type: 'source' | 'target', value: string) => {
    if (type === 'source') {
      updateLanguages({ sourceLanguage: value });
    } else {
      updateLanguages({ targetLanguage: value });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Deep Dict</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <LanguageSelector
              label="From"
              value={languages.sourceLanguage}
              type="source"
              onChange={(value) => handleLanguageChange('source', value)}
            />
            
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            
            <LanguageSelector
              label="To"
              value={languages.targetLanguage}
              type="target"
              onChange={(value) => handleLanguageChange('target', value)}
            />
            
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
          {/* Left Panel - NO ContextSearch here anymore */}
          <div className="space-y-4">
            {/* Recent Lookups */}
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
                    {recentEntries.map((entry) => (
                      <button
                        key={`recent-${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`}
                        onClick={() => handleSearchEntry(entry.headword, false)}
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

            {/* Search existing entries */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Filter Dictionary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filter entries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
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
                      Loading dictionary...
                    </div>
                  )}
                  
                  {/* All Entries */}
                  {entriesToShow.length > 0 ? (
                    entriesToShow.map((entry) => (
                      <button
                        key={`entry-${entry.headword}-${entry.metadata.source_language}-${entry.metadata.target_language}`}
                        onClick={() => handleSearchEntry(entry.headword, searchTerm.trim().length > 0)}
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
                        <div key={index} className="space-y-3">
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

                          {/* Examples with Export Buttons and context highlighting */}
                          {meaning.examples.map((example, exampleIndex) => (
                            <div key={exampleIndex} className={`dictionary-example relative group ${
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
                                
                                {/* Export Button */}
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
                        onClick={() => regenerateEntry(currentEntry.headword)}
                      >
                        🔄 Regenerate
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => deleteEntry(currentEntry.headword)}
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
                  {context.isContextMode && (
                    <span className="ml-2 text-purple-600 font-medium">
                      • Context mode active
                    </span>
                  )}
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