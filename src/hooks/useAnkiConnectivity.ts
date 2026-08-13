import { useEffect, useRef } from "react";
import { useAnkiStore } from "@/stores/ankiStore";
import { AnkiConnect } from "@/lib/anki";

/** Poll quickly while Anki is unreachable so reconnects are picked up fast */
const UNREACHABLE_POLL_MS = 15_000;
/** Slow heartbeat while reachable — catches Anki being closed */
const REACHABLE_POLL_MS = 60_000;
/** Short delay before the first poll to avoid blocking app startup */
const INITIAL_DELAY_MS = 1_000;

/**
 * Connectivity watcher for AnkiConnect. Polls testConnection() for as long
 * as the integration is enabled: every 15s while unreachable, every 60s as
 * a heartbeat while reachable. Writes `reachable` + `connectionStatus` into
 * the anki store, and on an unreachable→reachable transition refreshes the
 * available decks/note types and fires `onReachable` (future queue-flush
 * trigger).
 */
export function useAnkiConnectivity(onReachable?: () => void) {
  const enabled = useAnkiStore((state) => state.enabled);

  // Keep the latest callback without re-running the polling effect
  const onReachableRef = useRef(onReachable);
  onReachableRef.current = onReachable;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const wasReachable = useAnkiStore.getState().reachable;
      const ankiConnect = new AnkiConnect(); // Uses proxy endpoint
      const status = await ankiConnect.testConnection(); // Never throws

      if (cancelled) {
        return;
      }

      const { setConnectionStatus, setReachable } = useAnkiStore.getState();
      setConnectionStatus(status);
      setReachable(status.connected);

      if (status.connected && !wasReachable) {
        // Freshly (re)connected: refresh what's available in Anki
        try {
          const [decks, noteTypes] = await Promise.all([
            ankiConnect.getDecks(),
            ankiConnect.getNoteTypes(),
          ]);

          if (!cancelled) {
            const { setAvailableDecks, setAvailableNoteTypes } =
              useAnkiStore.getState();
            setAvailableDecks(decks);
            setAvailableNoteTypes(noteTypes);
          }
        } catch (error) {
          console.warn("Failed to fetch Anki data after connect:", error);
        }

        if (!cancelled) {
          onReachableRef.current?.();
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(
          poll,
          status.connected ? REACHABLE_POLL_MS : UNREACHABLE_POLL_MS,
        );
      }
    };

    timeoutId = setTimeout(poll, INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [enabled]);
}
