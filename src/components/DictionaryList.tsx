"use client";

import { useCallback } from "react";
import { Search, BookOpen, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationGrid } from "@/components/PaginationGrid";
import { DictionaryEntry, PaginationPage } from "@/lib/types";

interface DictionaryListProps {
  searchInput: string;
  setSearchInput: (value: string) => void;
  searchTerm: string;
  searchLoading: boolean;
  filteredRecentEntries: DictionaryEntry[];
  entriesToShow: DictionaryEntry[];
  loading: boolean;
  totalEntries: number;
  searchTotal: number;
  paginationIndex: PaginationPage[] | undefined;
  currentPage: number;
  entriesCount: number;
  onSelectEntry: (headword: string) => void;
  onLoadMore: () => void;
  onPageSelect: (page: number) => void;
}

export function DictionaryList({
  searchInput,
  setSearchInput,
  searchTerm,
  searchLoading,
  filteredRecentEntries,
  entriesToShow,
  loading,
  totalEntries,
  searchTotal,
  paginationIndex,
  currentPage,
  entriesCount,
  onSelectEntry,
  onLoadMore,
  onPageSelect,
}: DictionaryListProps) {
  const handleClearSearch = useCallback(() => {
    setSearchInput("");
  }, [setSearchInput]);

  return (
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
                  onClick={() => onSelectEntry(entry.headword)}
                  className="w-full text-left p-2 rounded hover:bg-muted transition-colors border-l-2 border-primary bg-primary/5"
                >
                  <div className="font-medium">{entry.headword}</div>
                  <div className="text-xs text-muted-foreground">
                    {Array.isArray(entry.part_of_speech)
                      ? entry.part_of_speech.join(", ")
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
            Dictionary ({searchTerm.trim() ? searchTotal : totalEntries})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-96 overflow-y-auto dictionary-list-top">
            {entriesToShow.length > 0 ? (
              <>
                {entriesToShow.map((entry, index) => (
                  <button
                    key={`entry-${entry.headword}-${index}`}
                    onClick={() => onSelectEntry(entry.headword)}
                    className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                  >
                    <div className="font-medium">{entry.headword}</div>
                    <div className="text-xs text-muted-foreground">
                      {Array.isArray(entry.part_of_speech)
                        ? entry.part_of_speech.join(", ")
                        : entry.part_of_speech}
                    </div>
                  </button>
                ))}

                {/* Pagination Grid (Replacing Load More) */}
                {!searchTerm.trim() && !loading && (
                  <div className="pt-8 border-t mt-4">
                    <PaginationGrid
                      pages={paginationIndex || []}
                      currentPage={currentPage}
                      onPageSelect={onPageSelect}
                    />

                    {/* Fallback Load More if grid is empty/fails, or just small number of entries */}
                    {(!paginationIndex || paginationIndex.length <= 1) &&
                      entriesCount < totalEntries && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onLoadMore}
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
                {searchTerm.trim()
                  ? "No entries found matching your search."
                  : "No entries yet for this language combination."}
              </div>
            )}

            {/* Search Results Count (Footer) */}
            {searchTerm.trim() && entriesToShow.length > 0 && (
              <div className="pt-4 text-center text-sm text-muted-foreground border-t mt-4">
                Found {searchTotal} results
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
