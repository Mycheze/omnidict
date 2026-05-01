import type { DictionaryEntry } from '@/lib/types';

export function makeSampleEntry(overrides?: Partial<DictionaryEntry>): DictionaryEntry {
  return {
    metadata: {
      source_language: 'English',
      target_language: 'Czech',
      definition_language: 'English',
      has_context: false,
    },
    headword: 'hello',
    part_of_speech: 'interjection',
    meanings: [
      {
        definition: 'A greeting used when meeting someone',
        grammar: {},
        examples: [
          {
            sentence: 'Ahoj, jak se máš?',
            translation: 'Hello, how are you?',
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function makeSampleEntryWithContext(): DictionaryEntry {
  return makeSampleEntry({
    headword: 'run',
    part_of_speech: 'verb',
    metadata: {
      source_language: 'English',
      target_language: 'Czech',
      definition_language: 'English',
      has_context: true,
      context_sentence: 'The program will run overnight.',
    },
    meanings: [
      {
        definition: 'To execute or operate (software)',
        grammar: { verb_type: 'transitive' },
        examples: [
          {
            sentence: 'Program poběží přes noc.',
            translation: 'The program will run overnight.',
            is_context_sentence: true,
          },
        ],
      },
    ],
  });
}
