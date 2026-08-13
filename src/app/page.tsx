"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { BookOpen, Settings, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSelector } from "@/components/LanguageSelector";
import { ApiQueueStatus } from "@/components/ApiQueueStatus";
import { SettingsModal } from "@/components/SettingsModal";
import { AccountBadge } from "@/components/auth/AccountBadge";
import { ContextSearch } from "@/components/ContextSearch";
import { EntryDisplay } from "@/components/EntryDisplay";
import { AddWordForm } from "@/components/AddWordForm";
import { DictionaryList } from "@/components/DictionaryList";
import { useImmediateDebounce } from "@/hooks/shared/useDebounce";
import { useSettingsStore } from "@/stores/settingsStore";
import { useDictionaryStore } from "@/stores/dictionaryStore";
import { useDictionary } from "@/hooks/dictionary/useDictionary";
import { useAnkiConnectivity } from "@/hooks/useAnkiConnectivity";
import { useAnkiQueueMigration } from "@/hooks/useAnkiQueueMigration";
import { useAuth } from "@/hooks/useAuth";
import { AnkiQueueStatus } from "@/components/anki/AnkiQueueStatus";
import { flushPendingCards } from "@/lib/anki";

export default function DictionaryPage() {
  // LOCAL STATE
  const [newWord, setNewWord] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [, searchTerm] = useImmediateDebounce(searchInput, 300);
  const currentLanguageRef = useRef("");

  // Settings store
  const languages = useSettingsStore(
    useCallback((state) => state.languages, []),
  );
  const updateLanguages = useSettingsStore(
    useCallback((state) => state.updateLanguages, []),
  );
  const darkMode = useSettingsStore((state) => state.preferences.darkMode);
  const updatePreferences = useSettingsStore(
    (state) => state.updatePreferences,
  );

  // Dictionary store
  const currentEntry = useDictionaryStore((state) => state.currentEntry);
  const searchResults = useDictionaryStore((state) => state.searchResults);
  const loading = useDictionaryStore((state) => state.loading);
  const error = useDictionaryStore((state) => state.error);
  const clearContext = useDictionaryStore(
    useCallback((state) => state.clearContext, []),
  );
  const setSearchResults = useDictionaryStore(
    (state) => state.setSearchResults,
  );
  const entries = useDictionaryStore((state) => state.entries);

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
    loadEntriesPaginated,
    loadPaginationIndex,
    resetForLanguageChange,
    totalEntries,
  } = useDictionary();

  // Anki connectivity + delayed export queue: when Anki becomes reachable,
  // flush any cards queued while it was away; on login, move this device's
  // anonymous queue to the server.
  const { user } = useAuth();
  const handleAnkiReachable = useCallback(() => {
    void flushPendingCards({ loggedIn: Boolean(user) });
  }, [user]);
  useAnkiConnectivity(handleAnkiReachable);
  useAnkiQueueMigration();

  // Stable language pair string for change detection
  const languagePair = useMemo(
    () => `${languages.sourceLanguage}-${languages.targetLanguage}`,
    [languages.sourceLanguage, languages.targetLanguage],
  );

  // Load entries when language changes (including initial mount)
  useEffect(() => {
    if (currentLanguageRef.current !== languagePair) {
      currentLanguageRef.current = languagePair;
      resetForLanguageChange();
      loadEntriesPaginated(1, 50, true);
      loadPaginationIndex();
    }
  }, [
    languagePair,
    loadEntriesPaginated,
    resetForLanguageChange,
    loadPaginationIndex,
  ]);

  // Search effect
  useEffect(() => {
    if (searchTerm.trim()) {
      searchEntries(searchTerm);
    } else {
      setSearchResults({ entries: [], total: 0, page: 1, pageSize: 50 });
    }
  }, [searchTerm, searchEntries, setSearchResults]);

  // Apply dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Derived data
  const filteredRecentEntries = useMemo(
    () => getFilteredRecentEntries(),
    [getFilteredRecentEntries],
  );
  const entriesToShow = useMemo(
    () => (searchTerm.trim() ? searchResults.entries : entries),
    [searchTerm, searchResults.entries, entries],
  );

  // HANDLERS
  const handleSearchEntry = useCallback(
    (headword: string) => {
      getEntry(headword, false);
    },
    [getEntry],
  );

  const handleCreateNewEntry = useCallback(() => {
    if (!newWord.trim()) return;
    setIsSubmitting(true);
    createEntry(newWord.trim());
    setNewWord("");
    setTimeout(() => setIsSubmitting(false), 500);
  }, [newWord, createEntry]);

  const handleWordSelectFromContext = useCallback((word: string) => {
    setNewWord(word);
  }, []);

  const handleContextualSearch = useCallback(
    (word: string, contextSentence: string) => {
      setIsSubmitting(true);
      setNewWord("");
      createContextualEntry(word, contextSentence);
      clearContext();
      setTimeout(() => setIsSubmitting(false), 500);
    },
    [createContextualEntry, clearContext],
  );

  const handleLanguageChange = useCallback(
    (type: "source" | "target", value: string) => {
      if (type === "source") {
        updateLanguages({ sourceLanguage: value });
      } else {
        updateLanguages({ targetLanguage: value });
      }
    },
    [updateLanguages],
  );

  const handleRegenerateEntry = useCallback(() => {
    if (currentEntry) {
      regenerateEntry(currentEntry.headword);
    }
  }, [currentEntry, regenerateEntry]);

  const handleDeleteEntry = useCallback(() => {
    if (currentEntry) {
      deleteEntry(currentEntry.headword);
    }
  }, [currentEntry, deleteEntry]);

  const handleLoadMoreEntries = useCallback(async () => {
    if (!loading) {
      const nextPage = Math.ceil(entries.length / 50) + 1;
      await loadEntriesPaginated(nextPage, 50, false);
    }
  }, [loading, entries.length, loadEntriesPaginated]);

  const handlePageSelect = useCallback(
    (page: number) => {
      loadEntriesPaginated(page, 50, true);
      const listTop = document.querySelector(".dictionary-list-top");
      if (listTop) listTop.scrollTop = 0;
    },
    [loadEntriesPaginated],
  );

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
              onChange={(value) => handleLanguageChange("source", value)}
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <LanguageSelector
              label="Target"
              value={languages.targetLanguage}
              type="target"
              onChange={(value) => handleLanguageChange("target", value)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updatePreferences({ darkMode: !darkMode })}
              title="Toggle dark mode"
            >
              {darkMode ? "Light" : "Dark"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <AccountBadge />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Entry Display Area */}
          <div className="lg:col-span-2 lg:order-2">
            {error && (
              <Card className="mb-4 border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            <EntryDisplay
              currentEntry={currentEntry}
              onRegenerate={handleRegenerateEntry}
              onDelete={handleDeleteEntry}
            />

            <AddWordForm
              newWord={newWord}
              setNewWord={setNewWord}
              isSubmitting={isSubmitting}
              onSubmit={handleCreateNewEntry}
              sourceLanguage={languages.sourceLanguage}
              targetLanguage={languages.targetLanguage}
            />

            <div className="mt-6">
              <ContextSearch
                onWordSelect={handleWordSelectFromContext}
                onContextualSearch={handleContextualSearch}
              />
            </div>
          </div>

          {/* Search & Lists Panel */}
          <DictionaryList
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            searchTerm={searchTerm}
            searchLoading={searchLoading}
            filteredRecentEntries={filteredRecentEntries}
            entriesToShow={entriesToShow}
            loading={loading}
            totalEntries={totalEntries}
            searchTotal={searchResults.total}
            paginationIndex={searchResults.paginationIndex}
            currentPage={searchResults.page}
            entriesCount={entries.length}
            onSelectEntry={handleSearchEntry}
            onLoadMore={handleLoadMoreEntries}
            onPageSelect={handlePageSelect}
          />
        </div>
      </div>

      <ApiQueueStatus />
      <AnkiQueueStatus />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
