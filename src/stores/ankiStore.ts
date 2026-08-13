import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AnkiSettings,
  AnkiDeck,
  AnkiNoteType,
  AnkiFieldMapping,
  AnkiConnectionStatus,
} from "@/lib/types";

interface AnkiState extends AnkiSettings {
  // Runtime connectivity (not persisted — a fresh page load knows nothing
  // about whether Anki is running until the connectivity watcher polls)
  reachable: boolean;
  connectionStatus: AnkiConnectionStatus;

  // Available options from Anki
  availableDecks: AnkiDeck[];
  availableNoteTypes: AnkiNoteType[];

  // UI state
  isConnecting: boolean;
  isExporting: boolean;
  lastExportTime: number | null;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setReachable: (reachable: boolean) => void;
  setDeck: (deck: string) => void;
  setNoteType: (noteType: string) => void;
  setFieldMappings: (mappings: AnkiFieldMapping[]) => void;
  setTags: (tags: string[]) => void;
  setAvailableDecks: (decks: AnkiDeck[]) => void;
  setAvailableNoteTypes: (noteTypes: AnkiNoteType[]) => void;
  setConnectionStatus: (status: AnkiConnectionStatus) => void;
  setIsConnecting: (connecting: boolean) => void;
  setIsExporting: (exporting: boolean) => void;
  setLastExportTime: (time: number) => void;
  resetSettings: () => void;
}

const defaultSettings: AnkiSettings = {
  enabled: false,
  deck: "",
  noteType: "",
  fieldMappings: [],
  tags: ["omnidict"],
};

/** Only user settings persist; runtime/connection state is rebuilt each load */
type PersistedAnkiSettings = AnkiSettings;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldMapping(value: unknown): value is AnkiFieldMapping {
  return (
    isRecord(value) &&
    typeof value.ankiField === "string" &&
    typeof value.deepDictField === "string"
  );
}

/**
 * Normalize any previously persisted blob (v1 included connection state and
 * a dead `ankiConnectUrl` field) down to just the user settings.
 */
function migratePersistedSettings(persisted: unknown): PersistedAnkiSettings {
  const old = isRecord(persisted) ? persisted : {};

  return {
    enabled: typeof old.enabled === "boolean" ? old.enabled : false,
    deck: typeof old.deck === "string" ? old.deck : "",
    noteType: typeof old.noteType === "string" ? old.noteType : "",
    fieldMappings: Array.isArray(old.fieldMappings)
      ? old.fieldMappings.filter(isFieldMapping)
      : [],
    tags:
      Array.isArray(old.tags) &&
      old.tags.every((tag): tag is string => typeof tag === "string")
        ? old.tags
        : ["omnidict"],
  };
}

export const useAnkiStore = create<AnkiState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      // Runtime state
      reachable: false,
      connectionStatus: { connected: false },
      availableDecks: [],
      availableNoteTypes: [],
      isConnecting: false,
      isExporting: false,
      lastExportTime: null,

      // Actions
      setEnabled: (enabled) => set({ enabled }),
      setReachable: (reachable) => set({ reachable }),
      setDeck: (deck) => set({ deck }),
      setNoteType: (noteType) => {
        set({ noteType });
        // Reset field mappings when note type changes
        const state = get();
        const selectedNoteType = state.availableNoteTypes.find(
          (nt) => nt.name === noteType,
        );
        if (selectedNoteType) {
          const newMappings: AnkiFieldMapping[] = selectedNoteType.fields.map(
            (field) => ({
              ankiField: field,
              deepDictField: "none",
            }),
          );
          set({ fieldMappings: newMappings });
        }
      },
      setFieldMappings: (mappings) => set({ fieldMappings: mappings }),
      setTags: (tags) => set({ tags }),
      setAvailableDecks: (decks) => set({ availableDecks: decks }),
      setAvailableNoteTypes: (noteTypes) =>
        set({ availableNoteTypes: noteTypes }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setIsConnecting: (connecting) => set({ isConnecting: connecting }),
      setIsExporting: (exporting) => set({ isExporting: exporting }),
      setLastExportTime: (time) => set({ lastExportTime: time }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "deep-dict-anki-settings",
      version: 2,
      partialize: (state): PersistedAnkiSettings => ({
        enabled: state.enabled,
        deck: state.deck,
        noteType: state.noteType,
        fieldMappings: state.fieldMappings,
        tags: state.tags,
      }),
      migrate: (persistedState) => migratePersistedSettings(persistedState),
    },
  ),
);
