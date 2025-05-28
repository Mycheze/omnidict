import { useEffect } from 'react';
import { useAnkiStore } from '@/stores/ankiStore';
import { AnkiConnect } from '@/lib/anki/ankiConnect';

export function useAnkiAutoConnect() {
  const {
    enabled,
    connected,
    setConnected,
    setConnectionStatus,
    setAvailableDecks,
    setAvailableNoteTypes,
  } = useAnkiStore();

  useEffect(() => {
    // Only auto-connect if Anki integration is enabled but not currently connected
    if (!enabled || connected) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const attemptConnection = async () => {
      try {
        const ankiConnect = new AnkiConnect(); // Uses proxy endpoint
        const status = await ankiConnect.testConnection();
        
        if (status.connected) {
          setConnectionStatus(status);
          setConnected(true);

          // Fetch available decks and note types
          try {
            const [decks, noteTypes] = await Promise.all([
              ankiConnect.getDecks(),
              ankiConnect.getNoteTypes(),
            ]);
            
            setAvailableDecks(decks);
            setAvailableNoteTypes(noteTypes);
            
            console.log('Anki auto-connection successful');
          } catch (error) {
            console.warn('Failed to fetch Anki data during auto-connect:', error);
          }
        } else {
          // Connection failed, but don't show error in auto-connect
          setConnectionStatus(status);
          
          // Retry after 10 seconds if enabled
          if (enabled) {
            timeoutId = setTimeout(attemptConnection, 10000);
          }
        }
      } catch (error) {
        console.warn('Anki auto-connection failed:', error);
        
        // Retry after 10 seconds if enabled
        if (enabled) {
          timeoutId = setTimeout(attemptConnection, 10000);
        }
      }
    };

    // Start connection attempt after a short delay to avoid blocking app startup
    timeoutId = setTimeout(attemptConnection, 1000);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    enabled, 
    connected, 
    setConnected,
    setConnectionStatus,
    setAvailableDecks,
    setAvailableNoteTypes,
  ]);
}