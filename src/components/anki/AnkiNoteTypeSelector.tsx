'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAnkiStore } from '@/stores/ankiStore';

export function AnkiNoteTypeSelector() {
  const { availableNoteTypes, noteType, setNoteType } = useAnkiStore();
  const [isOpen, setIsOpen] = useState(false);

  if (availableNoteTypes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">
            No note types found. Make sure you have at least one note type in Anki.
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedNoteType = availableNoteTypes.find(nt => nt.name === noteType);

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <label className="text-sm font-medium">Note Type</label>
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full justify-between"
          >
            <span>{noteType || 'Select a note type...'}</span>
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
                  {availableNoteTypes.map((noteTypeOption) => (
                    <button
                      key={noteTypeOption.name}
                      onClick={() => {
                        setNoteType(noteTypeOption.name);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{noteTypeOption.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {noteTypeOption.fields.length} fields: {noteTypeOption.fields.join(', ')}
                          </div>
                        </div>
                        {noteType === noteTypeOption.name && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {selectedNoteType && (
          <div className="text-xs text-muted-foreground">
            Fields: {selectedNoteType.fields.join(', ')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}