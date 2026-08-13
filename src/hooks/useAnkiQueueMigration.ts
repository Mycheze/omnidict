"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAnkiQueueStore } from "@/stores/ankiQueueStore";
import { ApiResponse } from "@/lib/types";

/**
 * One-shot migration of the anonymous local Anki queue to the server queue
 * once the user signs in. Imported cards are removed locally; duplicates on
 * the server side are ignored (INSERT OR IGNORE), so re-running is safe.
 */
export function useAnkiQueueMigration() {
  const { user } = useAuth();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!user || attemptedRef.current) {
      return;
    }

    const toImport = useAnkiQueueStore
      .getState()
      .localQueue.filter((card) => card.status !== "done");
    if (toImport.length === 0) {
      return;
    }

    attemptedRef.current = true;

    (async () => {
      // Local queue is capped at 500 — same as the import route's limit —
      // so one request always suffices.
      const response = await fetch("/api/anki-queue/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: toImport.map((card) => ({ context: card.context })),
        }),
      });
      const body: ApiResponse<{ imported: number }> = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      // Only clear what was actually sent — cards queued mid-flight stay
      const { removeLocal } = useAnkiQueueStore.getState();
      toImport.forEach((card) => removeLocal(card.id));
    })().catch((error) => {
      // Allow a retry on the next login state change
      attemptedRef.current = false;
      console.warn("Failed to import local Anki queue to server:", error);
    });
  }, [user]);
}
