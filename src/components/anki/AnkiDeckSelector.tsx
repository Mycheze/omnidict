'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAnkiStore } from '@/stores/ankiStore';

export function AnkiDeckSelector() {
  const { availableDecks, deck, setDeck } = useAnkiStore();
  const [isOpen, setIsOpen] = useState(false);

  if (availableDecks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">
            No decks found. Make sure you have at least one deck in Anki.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <label className="text-sm font-medium">Target Deck</label>
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full justify-between"
          >
            <span>{deck || 'Select a deck...'}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>

          {isOpen && (
            <>
              <div 
                className="fixed inset-0 z-10"
                onClick={() => setIsOpen(false)}
              />
              <Card className="absolute top-full left-0 mt-1 z-20 w-full max-h-60 overflow-y-auto">
                <CardContent className="p-2">
                  {availableDecks.map((deckOption) => (
                    <button
                      key={deckOption.name}
                      onClick={() => {
                        setDeck(deckOption.name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors flex items-center justify-between"
                    >
                      <span>{deckOption.name}</span>
                      {deck === deckOption.name && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}