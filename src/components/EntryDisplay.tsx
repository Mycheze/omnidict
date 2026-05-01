"use client";

import { useCallback } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnkiExportButton } from "@/components/anki/AnkiExportButton";
import { AnkiUpdateButton } from "@/components/anki/AnkiUpdateButton";
import { DictionaryEntry } from "@/lib/types";

interface EntryDisplayProps {
  currentEntry: DictionaryEntry | null;
  onRegenerate: () => void;
  onDelete: () => void;
}

export function EntryDisplay({
  currentEntry,
  onRegenerate,
  onDelete,
}: EntryDisplayProps) {
  if (!currentEntry) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No entry selected</h3>
            <p>
              Click on an entry from the dictionary list, use context-aware
              search, or create a new one below.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="dictionary-entry">
          {/* Language info with context indicator */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">
              {currentEntry.metadata.source_language} →{" "}
              {currentEntry.metadata.target_language}
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
            (
            {Array.isArray(currentEntry.part_of_speech)
              ? currentEntry.part_of_speech.join(", ")
              : currentEntry.part_of_speech}
            )
          </p>

          {/* Meanings */}
          <div className="space-y-6">
            {currentEntry.meanings.map((meaning, index) => (
              <div key={`meaning-${index}`} className="space-y-3">
                <div className="dictionary-definition">
                  {index + 1}. {meaning.definition}
                </div>

                {/* Grammar info */}
                {(meaning.grammar.noun_type ||
                  meaning.grammar.verb_type ||
                  meaning.grammar.comparison) && (
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
                  <div
                    key={`example-${index}-${exampleIndex}`}
                    className={`dictionary-example relative group ${
                      example.is_context_sentence
                        ? "bg-green-100 border-green-300"
                        : ""
                    }`}
                  >
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
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
