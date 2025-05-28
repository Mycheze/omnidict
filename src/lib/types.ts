// Database Types
export interface DatabaseEntry {
  id: number;
  headword: string;
  part_of_speech: string;  // Always string in database (JSON when array)
  source_language: string;
  target_language: string;
  definition_language: string;
  has_context?: number;
  context_sentence?: string;
  created_at: string;
}

export interface DatabaseMeaning {
  id: number;
  entry_id: number;
  definition: string;
  noun_type?: string;
  verb_type?: string;
  comparison?: string;
}

export interface DatabaseExample {
  id: number;
  meaning_id: number;
  sentence: string;
  translation?: string;
  is_context_sentence?: number;
}

// Application Types - Updated for Context Support
export interface DictionaryEntry {
  metadata: {
    source_language: string;
    target_language: string;
    definition_language: string;
    has_context?: boolean;
    context_sentence?: string;
  };
  headword: string;
  part_of_speech: string | string[];
  meanings: Meaning[];
}

export interface Meaning {
  definition: string;
  grammar: {
    noun_type?: string;
    verb_type?: string;
    comparison?: string;
    gender?: string;
    plurality?: string;
    tense?: string;
    case?: string;
  };
  examples: Example[];
}

export interface Example {
  sentence: string;
  translation?: string;
  is_context_sentence?: boolean;
}

// Context-aware search types
export interface ContextualEntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
  contextSentence: string;
}

export interface ContextAwareState {
  contextSentence: string;
  selectedWord: string;
  isContextMode: boolean;
  selectedWordRange?: { start: number; end: number };
  isContextExpanded: boolean;
}

// Search and Filter Types
export interface SearchFilters {
  searchTerm?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  definitionLanguage?: string;
  partOfSpeech?: string;
}

export interface SearchResult {
  entries: DictionaryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Language Types
export interface Language {
  code: string;
  name: string;
  displayName: string;
}

export interface LanguageSettings {
  sourceLanguage: string;
  targetLanguage: string;
  definitionLanguage: string;
}

// AI Types
export interface LemmaRequest {
  word: string;
  targetLanguage: string;
}

export interface LemmaResponse {
  lemma: string;
  cached: boolean;
}

export interface EntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
  definitionLanguage: string;
}

// User Settings Types
export interface UserSettings {
  languages: LanguageSettings;
  preferences: {
    autoSave: boolean;
    showTranslations: boolean;
    enableClipboardMonitoring: boolean;
  };
  ai: {
    provider: 'deepseek' | 'openai';
    temperature: number;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Component Props Types
export interface DictionaryEntryProps {
  entry: DictionaryEntry;
  onEdit?: (entry: DictionaryEntry) => void;
  onDelete?: (headword: string) => void;
  onRegenerate?: (headword: string) => void;
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
}

export interface LanguageSelectorProps {
  value: string;
  onChange: (language: string) => void;
  languages: Language[];
  label?: string;
}

// Simplified Language Settings (for the new UI)
export interface SimplifiedLanguageSettings {
  sourceLanguage: string;
  targetLanguage: string;
}

// Updated User Settings for simplified version
export interface SimplifiedUserSettings {
  languages: SimplifiedLanguageSettings;
  preferences: {
    autoSave: boolean;
    showTranslations: boolean;
    enableClipboardMonitoring: boolean;
  };
  ai: {
    provider: 'deepseek' | 'openai';
    temperature: number;
  };
}

// Queue System Types
export interface QueuedRequest {
  id: string;
  type: 'create' | 'regenerate' | 'get' | 'delete' | 'lemma';
  word: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime: number;
  result?: any;
  error?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ApiQueueState {
  queue: QueuedRequest[];
  activeRequests: QueuedRequest[];
  completedRequests: QueuedRequest[];
}

// Anki-related types
export interface AnkiDeck {
  name: string;
}

export interface AnkiNoteType {
  name: string;
  fields: string[];
}

export interface AnkiFieldMapping {
  ankiField: string;
  deepDictField: 'headword' | 'definition' | 'partOfSpeech' | 'example' | 'translation' | 'tags' | 'none';
  staticValue?: string; // For hardcoded values like tags
}

export interface AnkiSettings {
  enabled: boolean;
  connected: boolean;
  deck: string;
  noteType: string;
  fieldMappings: AnkiFieldMapping[];
  tags: string[];
  ankiConnectUrl: string;
}

export interface AnkiConnectionStatus {
  connected: boolean;
  version?: string;
  error?: string;
}

export interface AnkiCard {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
}

// Export context for creating cards
export interface ExportContext {
  headword: string;
  definition: string;
  partOfSpeech: string | string[];
  example: string;
  translation?: string;
}

export interface ManagedLanguage {
  standardizedName: string; // Base language name for DB (e.g., "Spanish")
  displayName: string;     // User's preferred display name (e.g., "Español")
  visible: boolean;        // Whether to show in dropdowns
  isCustom: boolean;       // Whether user added this (vs from DB)
}

export interface LanguageValidationRequest {
  inputLanguage: string;
}

export interface LanguageValidationResponse {
  standardizedName: string;
  displayName: string;
}

export interface LanguageManagementState {
  sourceLanguages: ManagedLanguage[];
  targetLanguages: ManagedLanguage[];
  lastSyncTime: number | null;
}