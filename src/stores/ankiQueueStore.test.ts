import { describe, it, expect, beforeEach } from "vitest";
import {
  useAnkiQueueStore,
  LocalPendingCard,
  LOCAL_QUEUE_CAP,
} from "./ankiQueueStore";
import { computeDedupKey } from "@/lib/anki/exportCard";
import { ExportContext, PendingAnkiCardRow } from "@/lib/types";

const context: ExportContext = {
  headword: "kočka",
  definition: "a cat",
  partOfSpeech: "noun",
  example: "Kočka spí.",
  targetLanguage: "Czech",
};

function makeLocalCard(overrides: Partial<LocalPendingCard>): LocalPendingCard {
  return {
    id: "card-1",
    dedupKey: "key-1",
    context,
    status: "queued",
    attempts: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("ankiQueueStore", () => {
  beforeEach(() => {
    useAnkiQueueStore.setState({
      localQueue: [],
      isFlushing: false,
      lastFlushResult: null,
      serverPending: [],
    });
  });

  describe("enqueueLocal", () => {
    it("adds a card with a computed dedup key", async () => {
      const result = await useAnkiQueueStore.getState().enqueueLocal(context);

      expect(result).toEqual({ queued: true });
      const queue = useAnkiQueueStore.getState().localQueue;
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe("queued");
      expect(queue[0].attempts).toBe(0);
      expect(queue[0].context).toEqual(context);
      expect(queue[0].dedupKey).toBe(await computeDedupKey(context));
      expect(queue[0].createdAt).toBeGreaterThan(0);
    });

    it("rejects a duplicate of an already-queued card", async () => {
      await useAnkiQueueStore.getState().enqueueLocal(context);
      const second = await useAnkiQueueStore.getState().enqueueLocal(context);

      expect(second).toEqual({ queued: false, reason: "duplicate" });
      expect(useAnkiQueueStore.getState().localQueue).toHaveLength(1);
    });

    it("queues different cards separately", async () => {
      await useAnkiQueueStore.getState().enqueueLocal(context);
      const second = await useAnkiQueueStore
        .getState()
        .enqueueLocal({ ...context, headword: "pes" });

      expect(second).toEqual({ queued: true });
      expect(useAnkiQueueStore.getState().localQueue).toHaveLength(2);
    });

    it("rejects when the queue is at capacity", async () => {
      const full = Array.from({ length: LOCAL_QUEUE_CAP }, (_, i) =>
        makeLocalCard({ id: `card-${i}`, dedupKey: `key-${i}` }),
      );
      useAnkiQueueStore.setState({ localQueue: full });

      const result = await useAnkiQueueStore.getState().enqueueLocal(context);

      expect(result).toEqual({ queued: false, reason: "full" });
      expect(useAnkiQueueStore.getState().localQueue).toHaveLength(
        LOCAL_QUEUE_CAP,
      );
    });
  });

  describe("markLocal / removeLocal / clearFlushed", () => {
    it("patches the matching card only", () => {
      useAnkiQueueStore.setState({
        localQueue: [
          makeLocalCard({ id: "a", dedupKey: "ka" }),
          makeLocalCard({ id: "b", dedupKey: "kb" }),
        ],
      });

      useAnkiQueueStore
        .getState()
        .markLocal("a", { status: "error", error: "boom", attempts: 1 });

      const queue = useAnkiQueueStore.getState().localQueue;
      expect(queue[0]).toMatchObject({
        id: "a",
        status: "error",
        error: "boom",
        attempts: 1,
      });
      expect(queue[1]).toMatchObject({ id: "b", status: "queued" });
    });

    it("removes a card by id", () => {
      useAnkiQueueStore.setState({
        localQueue: [
          makeLocalCard({ id: "a", dedupKey: "ka" }),
          makeLocalCard({ id: "b", dedupKey: "kb" }),
        ],
      });

      useAnkiQueueStore.getState().removeLocal("a");

      expect(useAnkiQueueStore.getState().localQueue.map((c) => c.id)).toEqual([
        "b",
      ]);
    });

    it("clearFlushed drops done cards but keeps queued and error cards", () => {
      useAnkiQueueStore.setState({
        localQueue: [
          makeLocalCard({ id: "a", dedupKey: "ka", status: "done" }),
          makeLocalCard({ id: "b", dedupKey: "kb", status: "error" }),
          makeLocalCard({ id: "c", dedupKey: "kc", status: "queued" }),
        ],
      });

      useAnkiQueueStore.getState().clearFlushed();

      expect(useAnkiQueueStore.getState().localQueue.map((c) => c.id)).toEqual([
        "b",
        "c",
      ]);
    });
  });

  describe("persistence", () => {
    it("persists only the local queue, not flush runtime state", () => {
      const options = useAnkiQueueStore.persist.getOptions();
      const serverRow = { id: 1 } as PendingAnkiCardRow;

      const persisted = options.partialize!({
        ...useAnkiQueueStore.getState(),
        localQueue: [makeLocalCard({})],
        isFlushing: true,
        lastFlushResult: {
          status: "completed",
          exported: 1,
          failed: 0,
          remaining: 0,
        },
        serverPending: [serverRow],
      });

      expect(Object.keys(persisted)).toEqual(["localQueue"]);
    });

    it("drops malformed and done cards on migrate", () => {
      const options = useAnkiQueueStore.persist.getOptions();
      const migrated = options.migrate!(
        {
          localQueue: [
            makeLocalCard({ id: "keep" }),
            makeLocalCard({ id: "done", status: "done" }),
            { junk: true },
            null,
          ],
          isFlushing: true,
        },
        1,
      ) as { localQueue: LocalPendingCard[] };

      expect(migrated.localQueue.map((c) => c.id)).toEqual(["keep"]);
    });
  });
});
