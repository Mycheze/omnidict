// Database Types
export interface DatabaseEntry {
  id: number;
  headword: string;
  part_of_speech: string; // Always string in database (JSON when array)
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

export interface PaginationPage {
  page: number;
  startHeadword: string;
  endHeadword: string;
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
  /** True when lemmatization failed and the original word was returned unchanged */
  fallback?: boolean;
}

export interface EntryGenerationRequest {
  word: string;
  sourceLanguage: string;
  targetLanguage: string;
  definitionLanguage: string;
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
  deepDictField:
    | "headword"
    | "definition"
    | "partOfSpeech"
    | "example"
    | "translation"
    | "tags"
    | "image"
    | "wordAudio"
    | "sentenceAudio"
    | "none";
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
  targetLanguage?: string; // Needed to resolve per-language media settings
}

// Media generation types
export type MediaType = "image" | "wordAudio" | "sentenceAudio";

/** Single source of truth for style ids — the Zod enum, the ImageStyle type,
 * and the settings dropdown all derive from this list */
export const IMAGE_STYLE_VALUES = [
  "storybook",
  "watercolor",
  "gothic",
  "photorealistic",
  "flat",
  "anime",
  "sketch",
] as const;

export type ImageStyle = (typeof IMAGE_STYLE_VALUES)[number];

/** Per-language media configuration, set by the user in settings */
export interface LanguageMediaConfig {
  googleLanguageCode: string; // e.g. "cs-CZ"
  googleVoiceName: string; // e.g. "cs-CZ-Chirp3-HD-Achernar"; empty = Google default voice
  elevenLabsVoiceId: string; // Voice ID from the user's ElevenLabs account
  elevenLabsLanguageCode: string; // e.g. "cs"; empty = auto-detect
  elevenLabsSpeed: number; // 0.7-1.2, lower = slower for learners
  imageStyle: ImageStyle;
}

export interface GeneratedMedia {
  filename: string;
  data: string; // base64-encoded file content
  mimeType: string;
  cached: boolean;
}

export interface MediaGenerationResult {
  image?: GeneratedMedia;
  wordAudio?: GeneratedMedia;
  sentenceAudio?: GeneratedMedia;
  errors?: Partial<Record<MediaType, string>>;
}

/** Which media provider API keys are configured server-side */
export interface MediaProviderStatus {
  googleTts: boolean;
  elevenLabs: boolean;
  replicate: boolean;
}

export interface ManagedLanguage {
  standardizedName: string; // Base language name for DB (e.g., "Spanish")
  displayName: string; // User's preferred display name (e.g., "Español")
  visible: boolean; // Whether to show in dropdowns
  isCustom: boolean; // Whether user added this (vs from DB)
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
