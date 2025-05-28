'use client';

import { ChevronDown, Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAnkiStore } from '@/stores/ankiStore';
import { AnkiFieldMapping } from '@/lib/types';

const DEEPDICT_FIELDS = [
  { value: 'headword', label: 'Headword' },
  { value: 'definition', label: 'Definition(s)' },
  { value: 'partOfSpeech', label: 'Part of Speech' },
  { value: 'example', label: 'Example Sentence' },
  { value: 'translation', label: 'Sentence Translation' },
  { value: 'tags', label: 'Tags' },
  { value: 'none', label: 'Not mapped' },
] as const;

export function AnkiFieldMapper() {
  const { 
    availableNoteTypes, 
    noteType, 
    fieldMappings, 
    tags,
    setFieldMappings,
    setTags 
  } = useAnkiStore();

  const [tagInput, setTagInput] = useState('');

  const selectedNoteType = availableNoteTypes.find(nt => nt.name === noteType);

  if (!selectedNoteType) {
    return null;
  }

  const updateFieldMapping = (ankiField: string, deepDictField: string, staticValue?: string) => {
    const updatedMappings = fieldMappings.map(mapping =>
      mapping.ankiField === ankiField
        ? { ankiField, deepDictField: deepDictField as AnkiFieldMapping['deepDictField'], staticValue }
        : mapping
    );
    setFieldMappings(updatedMappings);
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field Mapping</CardTitle>
        <p className="text-sm text-muted-foreground">
          Map Anki note fields to Deep Dict data
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {fieldMappings.map((mapping) => (
          <FieldMappingRow
            key={mapping.ankiField}
            mapping={mapping}
            onUpdate={updateFieldMapping}
          />
        ))}

        {/* Tags Configuration */}
        <div className="space-y-2 pt-4 border-t">
          <label className="text-sm font-medium">Tags</label>
          <div className="flex space-x-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag..."
              onKeyPress={(e) => e.key === 'Enter' && addTag()}
              className="flex-1"
            />
            <Button onClick={addTag} variant="outline" size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper component for individual field mapping rows
function FieldMappingRow({ 
  mapping, 
  onUpdate 
}: { 
  mapping: AnkiFieldMapping; 
  onUpdate: (ankiField: string, deepDictField: string, staticValue?: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [staticValue, setStaticValue] = useState(mapping.staticValue || '');

  const selectedField = DEEPDICT_FIELDS.find(f => f.value === mapping.deepDictField);

  return (
    <div className="flex items-center space-x-3 p-3 border rounded-lg">
      <div className="flex-1">
        <div className="font-medium text-sm">{mapping.ankiField}</div>
        <div className="text-xs text-muted-foreground">Anki field</div>
      </div>
      
      <div className="text-xs text-muted-foreground">→</div>
      
      <div className="flex-1 relative">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full justify-between text-sm"
        >
          <span>{selectedField?.label || 'Select field...'}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>

        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <Card className="absolute top-full left-0 mt-1 z-20 w-full">
              <CardContent className="p-2">
                {DEEPDICT_FIELDS.map((field) => (
                  <button
                    key={field.value}
                    onClick={() => {
                      onUpdate(mapping.ankiField, field.value);
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    <span>{field.label}</span>
                    {mapping.deepDictField === field.value && <Check className="h-3 w-3 text-primary" />}
                  </button>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {mapping.deepDictField === 'tags' && (
        <div className="flex-1">
          <Input
            value={staticValue}
            onChange={(e) => {
              setStaticValue(e.target.value);
              onUpdate(mapping.ankiField, mapping.deepDictField, e.target.value);
            }}
            placeholder="Custom tags..."
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}