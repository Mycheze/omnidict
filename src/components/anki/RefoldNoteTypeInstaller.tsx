"use client";

import { useState } from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAnkiStore } from "@/stores/ankiStore";
import { AnkiConnect } from "@/lib/anki/ankiConnect";
import { installRefoldNoteType } from "@/lib/anki/installRefoldNoteType";
import {
  REFOLD_NOTE_TYPES,
  REFOLD_DEFAULT_FIELD_MAPPINGS,
} from "@/lib/anki/refoldNoteTypes";

const DESCRIPTIONS: Record<string, string> = {
  "Refold Sentence Miner: Sentence":
    "Recommended: word + full sentence on the front",
  "Refold Sentence Miner: Sentence Hidden":
    "Word on the front, sentence behind a hint",
  "Refold Sentence Miner: Listening":
    "Sentence audio on the front for listening practice",
  "Refold Sentence Miner: Word Only": "Just the word on the front",
};

type Feedback =
  { type: "success"; message: string } | { type: "error"; message: string };

/**
 * Compact installer for the official Refold sentence-mining note types.
 * Installs the note type into Anki (with its fonts/icons), selects it, and
 * applies the matching default field mappings in one click.
 */
export function RefoldNoteTypeInstaller() {
  const {
    noteType,
    availableNoteTypes,
    setAvailableNoteTypes,
    setNoteType,
    setFieldMappings,
  } = useAnkiStore();

  const [installing, setInstalling] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleInstall = async (name: string) => {
    const refoldNoteType = REFOLD_NOTE_TYPES.find((nt) => nt.name === name);
    if (!refoldNoteType || installing) return;

    setInstalling(name);
    setFeedback(null);

    try {
      const client = new AnkiConnect();
      const { created } = await installRefoldNoteType(client, refoldNoteType);

      // Refresh the note type list so the store knows the new model,
      // then select it. setNoteType resets mappings to "none", so the
      // Refold defaults must be applied after it.
      const noteTypes = await client.getNoteTypes();
      setAvailableNoteTypes(noteTypes);
      setNoteType(refoldNoteType.name);
      setFieldMappings(REFOLD_DEFAULT_FIELD_MAPPINGS);

      setFeedback({
        type: "success",
        message: created
          ? `Installed "${refoldNoteType.name}" and applied default field mappings.`
          : `"${refoldNoteType.name}" was already installed — selected it and applied default field mappings.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Failed to install note type: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div>
          <label className="text-sm font-medium">Refold note types</label>
          <p className="text-xs text-muted-foreground">
            Install one of the official Refold sentence-mining note types and
            map Omnidict fields automatically.
          </p>
        </div>

        <div className="space-y-2">
          {REFOLD_NOTE_TYPES.map((refoldNoteType) => {
            const isInstalled = availableNoteTypes.some(
              (nt) => nt.name === refoldNoteType.name,
            );
            const isSelected = noteType === refoldNoteType.name;
            const isBusy = installing === refoldNoteType.name;

            return (
              <div
                key={refoldNoteType.name}
                className="flex items-center justify-between gap-2 rounded border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span className="truncate">{refoldNoteType.name}</span>
                    {isSelected && (
                      <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {DESCRIPTIONS[refoldNoteType.name]}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  disabled={installing !== null}
                  onClick={() => handleInstall(refoldNoteType.name)}
                >
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isInstalled ? "Use" : "Install & use"}
                </Button>
              </div>
            );
          })}
        </div>

        {feedback && (
          <div
            className={`flex items-center space-x-2 text-sm ${
              feedback.type === "success" ? "text-green-700" : "text-red-700"
            }`}
          >
            {feedback.type === "success" ? (
              <Check className="h-4 w-4 flex-shrink-0" />
            ) : (
              <X className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
