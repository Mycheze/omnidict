import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeDedupKey } from "@/lib/anki/exportCard";
import { ExportContext, PendingAnkiCardRow } from "@/lib/types";

/**
 * Delayed Anki export queue (client side).
 *
 * Anonymous users get a persisted local queue (this device only); logged-in
 * users queue on the server instead — `serverPending` is just a runtime
 * cache of their server rows for the status widget. Only `localQueue`
 * persists; flush runtime state is rebuilt each load.
 */

export type LocalPendingCardStatus = "queued" | "error" | "done";

export interface LocalPendingCard {
  id: string;
  dedupKey: string;
  context: ExportContext;
  status: LocalPendingCardStatus;
  error?: string;
  attempts: number;
  createdAt: number;
}

export interface FlushSummary {
  status:
    | "completed"
    | "not-configured"
    | "connection-lost"
    | "already-running"
    | "nothing-to-flush";
  exported: number;
  failed: number;
  remaining: number;
}

export interface EnqueueLocalResult {
  queued: boolean;
  reason?: "duplicate" | "full";
}

/** Hard cap on the local queue — beyond this, enqueue is rejected */
export const LOCAL_QUEUE_CAP = 500;

interface AnkiQueueState {
  // Persisted
  localQueue: LocalPendingCard[];

  // Runtime (not persisted)
  isFlushing: boolean;
  lastFlushResult: FlushSummary | null;
  serverPending: PendingAnkiCardRow[];

  // Actions
  enqueueLocal: (context: ExportContext) => Promise<EnqueueLocalResult>;
  removeLocal: (id: string) => void;
  markLocal: (
    id: string,
    patch: Partial<Pick<LocalPendingCard, "status" | "error" | "attempts">>,
  ) => void;
  clearFlushed: () => void;
  setIsFlushing: (flushing: boolean) => void;
  setLastFlushResult: (result: FlushSummary | null) => void;
  setServerPending: (rows: PendingAnkiCardRow[]) => void;
}

function generateLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function isLocalPendingCard(value: unknown): value is LocalPendingCard {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    typeof card.dedupKey === "string" &&
    typeof card.context === "object" &&
    card.context !== null &&
    (card.status === "queued" || card.status === "error") && // done cards are dropped on load
    typeof card.attempts === "number" &&
    typeof card.createdAt === "number"
  );
}

export const useAnkiQueueStore = create<AnkiQueueState>()(
  persist(
    (set, get) => ({
      localQueue: [],

      isFlushing: false,
      lastFlushResult: null,
      serverPending: [],

      enqueueLocal: async (context) => {
        const dedupKey = await computeDedupKey(context);
        const { localQueue } = get();

        if (localQueue.some((card) => card.dedupKey === dedupKey)) {
          return { queued: false, reason: "duplicate" };
        }
        if (localQueue.length >= LOCAL_QUEUE_CAP) {
          return { queued: false, reason: "full" };
        }

        const card: LocalPendingCard = {
          id: generateLocalId(),
          dedupKey,
          context,
          status: "queued",
          attempts: 0,
          createdAt: Date.now(),
        };
        set((state) => ({ localQueue: [...state.localQueue, card] }));
        return { queued: true };
      },

      removeLocal: (id) =>
        set((state) => ({
          localQueue: state.localQueue.filter((card) => card.id !== id),
        })),

      markLocal: (id, patch) =>
        set((state) => ({
          localQueue: state.localQueue.map((card) =>
            card.id === id ? { ...card, ...patch } : card,
          ),
        })),

      clearFlushed: () =>
        set((state) => ({
          localQueue: state.localQueue.filter((card) => card.status !== "done"),
        })),

      setIsFlushing: (isFlushing) => set({ isFlushing }),
      setLastFlushResult: (lastFlushResult) => set({ lastFlushResult }),
      setServerPending: (serverPending) => set({ serverPending }),
    }),
    {
      name: "omnidict-anki-queue",
      version: 1,
      // Only the local card queue persists; flush runtime state and the
      // server row cache are rebuilt each page load.
      partialize: (state) => ({ localQueue: state.localQueue }),
      migrate: (persisted) => {
        const old =
          typeof persisted === "object" && persisted !== null
            ? (persisted as Record<string, unknown>)
            : {};
        return {
          localQueue: Array.isArray(old.localQueue)
            ? old.localQueue.filter(isLocalPendingCard)
            : [],
        };
      },
    },
  ),
);
