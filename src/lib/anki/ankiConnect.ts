import { AnkiDeck, AnkiNoteType, AnkiCard, AnkiConnectionStatus } from '@/lib/types';

export class AnkiConnectError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

export class AnkiConnect {
  private baseUrl: string;

  constructor(baseUrl: string = '/api/anki') {
    // Use our proxy endpoint instead of direct AnkiConnect connection
    this.baseUrl = baseUrl;
  }

  /**
   * Make a request to AnkiConnect via our proxy
   */
  private async makeRequest(action: string, params: any = {}): Promise<any> {
    const request = {
      action,
      version: 6,
      params,
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        if (response.status === 503) {
          throw new AnkiConnectError(
            'Unable to connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.',
            'CONNECTION_FAILED'
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AnkiConnectError(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      if (data.error) {
        throw new AnkiConnectError(data.error);
      }

      return data.result;
    } catch (error: unknown) {
      if (error instanceof AnkiConnectError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AnkiConnectError(
          'Unable to connect to the application server.',
          'NETWORK_ERROR'
        );
      }

      // Handle other unknown errors safely
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new AnkiConnectError(`Unexpected error: ${errorMessage}`);
    }
  }

  /**
   * Test connection to AnkiConnect
   */
  async testConnection(): Promise<AnkiConnectionStatus> {
    try {
      const version = await this.makeRequest('version');
      return {
        connected: true,
        version: version.toString(),
      };
    } catch (error: unknown) {
      return {
        connected: false,
        error: error instanceof AnkiConnectError ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all deck names
   */
  async getDecks(): Promise<AnkiDeck[]> {
    const deckNames = await this.makeRequest('deckNames');
    return deckNames.map((name: string) => ({ name }));
  }

  /**
   * Get all note type names and their fields
   */
  async getNoteTypes(): Promise<AnkiNoteType[]> {
    const noteTypeNames = await this.makeRequest('modelNames');
    const noteTypes: AnkiNoteType[] = [];

    for (const name of noteTypeNames) {
      try {
        const fields = await this.makeRequest('modelFieldNames', { modelName: name });
        noteTypes.push({ name, fields });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Could not get fields for note type ${name}:`, errorMessage);
      }
    }

    return noteTypes;
  }

  /**
   * Add a note to Anki
   */
  async addNote(card: AnkiCard): Promise<number> {
    const note = {
      deckName: card.deckName,
      modelName: card.modelName,
      fields: card.fields,
      tags: card.tags,
    };

    return await this.makeRequest('addNote', { note });
  }

  /**
   * Find recent notes in a deck
   */
  async findRecentNotes(deckName: string, limit: number = 1): Promise<number[]> {
    const query = `deck:"${deckName}" added:1`; // Notes added in last 1 day
    const noteIds = await this.makeRequest('findNotes', { query });
    
    // Sort by note ID descending (newer notes have higher IDs typically)
    const sortedIds = noteIds.sort((a: number, b: number) => b - a);
    
    return sortedIds.slice(0, limit);
  }

  /**
   * Get note information including fields
   */
  async getNotesInfo(noteIds: number[]): Promise<any[]> {
    return await this.makeRequest('notesInfo', { notes: noteIds });
  }

  /**
   * Update note fields
   */
  async updateNoteFields(noteId: number, fields: Record<string, string>): Promise<void> {
    const note = {
      id: noteId,
      fields: fields,
    };

    await this.makeRequest('updateNoteFields', { note });
  }

  /**
   * Find and update the most recent note in a deck
   */
  async updateMostRecentNote(deckName: string, fields: Record<string, string>): Promise<boolean> {
    try {
      // Find the most recent note
      const recentNotes = await this.findRecentNotes(deckName, 1);
      
      if (recentNotes.length === 0) {
        throw new AnkiConnectError('No recent notes found in the specified deck');
      }

      const noteId = recentNotes[0];
      
      // Update the note fields
      await this.updateNoteFields(noteId, fields);
      
      return true;
    } catch (error) {
      console.error('Failed to update recent note:', error);
      throw error;
    }
  }

  /**
   * Check if AnkiConnect is available and get setup instructions
   */
  static getSetupInstructions(): {
    isLocalhost: boolean;
    instructions: string[];
    downloadUrl: string;
  } {
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';

    const instructions = [
      '1. Install the AnkiConnect add-on in Anki',
      '2. Restart Anki after installation',
      '3. Make sure Anki is running',
      '4. No CORS configuration needed (we use a proxy)',
    ];

    return {
      isLocalhost,
      instructions,
      downloadUrl: 'https://ankiweb.net/shared/info/2055492159',
    };
  }

  /**
   * Get CORS configuration help (not needed with proxy)
   */
  static getCorsConfigHelp(): string {
    return `This application uses a built-in proxy to communicate with AnkiConnect.
    
No CORS configuration is required! Just make sure:

1. Anki is running
2. AnkiConnect add-on is installed
3. AnkiConnect is enabled in Anki

If you're still having connection issues:
- Check that Anki is running in the background
- Verify AnkiConnect appears in Tools > Add-ons
- Try restarting Anki`;
  }
}