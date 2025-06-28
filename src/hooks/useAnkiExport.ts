import { useAnkiStore } from '@/stores/ankiStore';
import { AnkiConnect } from '@/lib/anki/ankiConnect';
import { ExportContext, AnkiCard } from '@/lib/types';

export function useAnkiExport() {
  const {
    deck,
    noteType,
    fieldMappings,
    tags,
    isExporting,
    setIsExporting,
    setLastExportTime,
  } = useAnkiStore();

  const exportToAnki = async (context: ExportContext): Promise<void> => {
    if (isExporting) {
      throw new Error('Export already in progress');
    }

    setIsExporting(true);

    try {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint
      
      // Build the fields object based on field mappings
      const fields: Record<string, string> = {};
      
      fieldMappings.forEach(mapping => {
        if (mapping.deepDictField === 'none') {
          return;
        }

        let value = '';
        switch (mapping.deepDictField) {
          case 'headword':
            value = context.headword;
            break;
          case 'definition':
            value = context.definition;
            break;
          case 'partOfSpeech':
            value = Array.isArray(context.partOfSpeech) 
              ? context.partOfSpeech.join(', ') 
              : context.partOfSpeech;
            break;
          case 'example':
            value = context.example;
            break;
          case 'translation':
            value = context.translation || '';
            break;
          case 'tags':
            value = mapping.staticValue || tags.join(' ');
            break;
        }

        fields[mapping.ankiField] = value;
      });

      // Create the card
      const card: AnkiCard = {
        deckName: deck,
        modelName: noteType,
        fields,
        tags: [...tags],
      };

      // Export to Anki
      const noteId = await ankiConnect.addNote(card);
      
      if (!noteId) {
        throw new Error('Failed to create note in Anki');
      }

      setLastExportTime(Date.now());
      console.log('Successfully exported to Anki, note ID:', noteId);
      
    } finally {
      setIsExporting(false);
    }
  };

  const updateLastAnkiCard = async (context: ExportContext): Promise<void> => {
    if (isExporting) {
      throw new Error('Export already in progress');
    }

    setIsExporting(true);

    try {
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint
      
      // Build the fields object based on field mappings
      const fields: Record<string, string> = {};
      
      fieldMappings.forEach(mapping => {
        if (mapping.deepDictField === 'none') {
          return;
        }

        let value = '';
        switch (mapping.deepDictField) {
          case 'headword':
            value = context.headword;
            break;
          case 'definition':
            value = context.definition;
            break;
          case 'partOfSpeech':
            value = Array.isArray(context.partOfSpeech) 
              ? context.partOfSpeech.join(', ') 
              : context.partOfSpeech;
            break;
          case 'example':
            value = context.example;
            break;
          case 'translation':
            value = context.translation || '';
            break;
          case 'tags':
            value = mapping.staticValue || tags.join(' ');
            break;
        }

        // Only include fields that have actual content (don't overwrite with empty values)
        if (value.trim()) {
          fields[mapping.ankiField] = value;
        }
      });

      // Update the most recent card in the deck
      await ankiConnect.updateMostRecentNote(deck, fields);
      
      setLastExportTime(Date.now());
      console.log('Successfully updated last Anki card with fields:', Object.keys(fields));
      
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportToAnki,
    updateLastAnkiCard,
    isExporting,
  };
}