"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AddWordFormProps {
  newWord: string;
  setNewWord: (word: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  sourceLanguage: string;
  targetLanguage: string;
}

export function AddWordForm({
  newWord,
  setNewWord,
  isSubmitting,
  onSubmit,
  sourceLanguage,
  targetLanguage,
}: AddWordFormProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
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
            onKeyDown={handleKeyDown}
          />
          <Button
            onClick={onSubmit}
            disabled={!newWord.trim() || isSubmitting}
            className={isSubmitting ? "bg-green-500 hover:bg-green-600" : ""}
          >
            {isSubmitting ? "Added" : "Add"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Learning: {sourceLanguage} → {targetLanguage}
        </p>
      </CardContent>
    </Card>
  );
}
