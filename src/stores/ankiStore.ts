import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AnkiSettings, AnkiDeck, AnkiNoteType, AnkiFieldMapping, AnkiConnectionStatus } from '@/lib/types';

interface AnkiState extends AnkiSettings {
  // Available options from Anki
  availableDecks: AnkiDeck[];
  availableNoteTypes: AnkiNoteType[];
  connectionStatus: AnkiConnectionStatus;
  
  // UI state
  isConnecting: boolean;
  isExporting: boolean;
  lastExportTime: number | null;
  
  // Actions
  setEnabled: (enabled: boolean) => void;
  setConnected: (connected: boolean) => void;
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
  connected: false,
  deck: '',
  noteType: '',
  fieldMappings: [],
  tags: ['deepdict'],
  ankiConnectUrl: '/api/anki', // Changed from 'http://localhost:8765'
};

export const useAnkiStore = create<AnkiState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      
      // Additional state
      availableDecks: [],
      availableNoteTypes: [],
      connectionStatus: { connected: false },
      isConnecting: false,
      isExporting: false,
      lastExportTime: null,

      // Actions
      setEnabled: (enabled) => set({ enabled }),
      setConnected: (connected) => set({ connected }),
      setDeck: (deck) => set({ deck }),
      setNoteType: (noteType) => {
        set({ noteType });
        // Reset field mappings when note type changes
        const state = get();
        const selectedNoteType = state.availableNoteTypes.find(nt => nt.name === noteType);
        if (selectedNoteType) {
          const newMappings: AnkiFieldMapping[] = selectedNoteType.fields.map(field => ({
            ankiField: field,
            deepDictField: 'none',
          }));
          set({ fieldMappings: newMappings });
        }
      },
      setFieldMappings: (mappings) => set({ fieldMappings: mappings }),
      setTags: (tags) => set({ tags }),
      setAvailableDecks: (decks) => set({ availableDecks: decks }),
      setAvailableNoteTypes: (noteTypes) => set({ availableNoteTypes: noteTypes }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setIsConnecting: (connecting) => set({ isConnecting: connecting }),
      setIsExporting: (exporting) => set({ isExporting: exporting }),
      setLastExportTime: (time) => set({ lastExportTime: time }),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'deep-dict-anki-settings',
      version: 1,
    }
  )
);