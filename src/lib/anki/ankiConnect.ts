import { AnkiDeck, AnkiNoteType, AnkiCard, AnkiConnectionStatus } from '@/lib/types';

export class AnkiConnectError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

export class AnkiConnect {
  private baseUrl: string;
  private useDirectConnection: boolean = false;

  constructor(baseUrl: string = '/api/anki') {
    this.baseUrl = baseUrl;
    // Detect if we should use direct connection
    this.detectConnectionMode();
  }

  /**
   * Detect whether to use proxy or direct connection
   */
  private detectConnectionMode() {
    if (typeof window !== 'undefined') {
      // Client-side: check if we're on localhost or hosted
      const isLocalhost = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1';
      
      // If not localhost, we'll need to try direct connection after proxy fails
      this.useDirectConnection = !isLocalhost;
    }
  }

  /**
   * Make a request to AnkiConnect, with fallback from proxy to direct
   */
  private async makeRequest(action: string, params: any = {}): Promise<any> {
    const request = {
      action,
      version: 6,
      params,
    };

    // First, try the proxy approach
    if (!this.useDirectConnection) {
      try {
        return await this.makeProxyRequest(request);
      } catch (error) {
        // If proxy fails with DIRECT_CONNECTION_REQUIRED, switch to direct mode
        if (error instanceof AnkiConnectError && error.message.includes('DIRECT_CONNECTION_REQUIRED')) {
          console.log('Switching to direct AnkiConnect connection');
          this.useDirectConnection = true;
          // Fall through to direct connection attempt
        } else {
          throw error;
        }
      }
    }

    // Try direct connection
    return await this.makeDirectRequest(request);
  }

  /**
   * Make request through our proxy (for local development)
   */
  private async makeProxyRequest(request: any): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.useDirectConnection) {
          throw new AnkiConnectError('DIRECT_CONNECTION_REQUIRED');
        }
        
        if (response.status === 503) {
          throw new AnkiConnectError(
            'Unable to connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.',
            'CONNECTION_FAILED'
          );
        }
        
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

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new AnkiConnectError(`Unexpected error: ${errorMessage}`);
    }
  }

  /**
   * Make request directly to localhost AnkiConnect (for hosted environments)
   */
  private async makeDirectRequest(request: any): Promise<any> {
    try {
      const response = await fetch('http://localhost:8765', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new AnkiConnectError(`AnkiConnect request failed: ${response.status}`);
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

      // Handle connection errors for direct connection
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AnkiConnectError(
          'Unable to connect to AnkiConnect. Make sure Anki is running, AnkiConnect is installed, and CORS is configured correctly.',
          'DIRECT_CONNECTION_FAILED'
        );
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new AnkiConnectError(`Direct connection error: ${errorMessage}`);
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
    const isLocalhost = typeof window !== 'undefined' && 
                       (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1');

    const instructions = isLocalhost ? [
      '1. Install the AnkiConnect add-on in Anki',
      '2. Restart Anki after installation',
      '3. Make sure Anki is running',
      '4. No CORS configuration needed (using proxy)',
    ] : [
      '1. Install the AnkiConnect add-on in Anki',
      '2. Restart Anki after installation', 
      '3. Make sure Anki is running',
      '4. Configure CORS in AnkiConnect settings:',
      '   - Tools → Add-ons → AnkiConnect → Config',
      '   - Add this domain to webCorsOriginList: https://omnidict.vercel.app',
      '   - Restart Anki',
    ];

    return {
      isLocalhost,
      instructions,
      downloadUrl: 'https://ankiweb.net/shared/info/2055492159',
    };
  }

  /**
   * Get CORS configuration help
   */
  static getCorsConfigHelp(): string {
    const isLocalhost = typeof window !== 'undefined' && 
                       (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1');

    if (isLocalhost) {
      return `Local development detected - using proxy connection.

No CORS configuration is required! Just make sure:

1. Anki is running
2. AnkiConnect add-on is installed  
3. AnkiConnect is enabled in Anki

If you're still having connection issues:
- Check that Anki is running in the background
- Verify AnkiConnect appears in Tools > Add-ons
- Try restarting Anki`;
    }

    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'your-domain';
    
    return `Hosted environment detected - using direct connection.

Required CORS configuration for AnkiConnect:

1. Open Anki
2. Go to Tools → Add-ons → AnkiConnect → Config
3. Add this to your webCorsOriginList:

{
    "webCorsOriginList": [
        "${currentOrigin}",
        "http://localhost"
    ]
}

4. Restart Anki
5. Make sure Anki is running when using the web app

Note: Your current domain (${currentOrigin}) must be in the CORS list.`;
  }
}