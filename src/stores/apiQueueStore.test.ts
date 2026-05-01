import { describe, it, expect, beforeEach, vi } from "vitest";
import { useApiQueueStore } from "./apiQueueStore";

describe("apiQueueStore", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    useApiQueueStore.setState({
      queue: [],
      activeRequests: [],
      completedRequests: [],
    });
  });

  describe("addToQueue", () => {
    it("adds request with generated id and pending status", () => {
      const id = useApiQueueStore.getState().addToQueue({
        type: "create",
        word: "hello",
      });

      expect(id).toMatch(/^create_hello_/);
      const queue = useApiQueueStore.getState().queue;
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe("pending");
      expect(queue[0].word).toBe("hello");
      expect(queue[0].startTime).toBeGreaterThan(0);
    });

    it("generates unique ids", () => {
      const store = useApiQueueStore.getState();
      const id1 = store.addToQueue({ type: "create", word: "hello" });
      const id2 = store.addToQueue({ type: "create", word: "hello" });

      expect(id1).not.toBe(id2);
    });

    it("preserves optional fields", () => {
      useApiQueueStore.getState().addToQueue({
        type: "create",
        word: "hello",
        sourceLanguage: "English",
        targetLanguage: "Czech",
      });

      const request = useApiQueueStore.getState().queue[0];
      expect(request.sourceLanguage).toBe("English");
      expect(request.targetLanguage).toBe("Czech");
    });
  });

  describe("startProcessing", () => {
    it("moves request from queue to activeRequests", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });

      useApiQueueStore.getState().startProcessing(id);

      expect(useApiQueueStore.getState().queue).toHaveLength(0);
      expect(useApiQueueStore.getState().activeRequests).toHaveLength(1);
      expect(useApiQueueStore.getState().activeRequests[0].status).toBe(
        "processing",
      );
    });

    it("does nothing if request not in queue", () => {
      useApiQueueStore.getState().startProcessing("nonexistent");

      expect(useApiQueueStore.getState().queue).toHaveLength(0);
      expect(useApiQueueStore.getState().activeRequests).toHaveLength(0);
    });
  });

  describe("completeRequest", () => {
    it("moves request from active to completed", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);

      useApiQueueStore.getState().completeRequest(id, { entry: "hello" });

      expect(useApiQueueStore.getState().activeRequests).toHaveLength(0);
      expect(useApiQueueStore.getState().completedRequests).toHaveLength(1);
      expect(useApiQueueStore.getState().completedRequests[0].status).toBe(
        "completed",
      );
      expect(useApiQueueStore.getState().completedRequests[0].result).toEqual({
        entry: "hello",
      });
    });

    it("caps completed at 10 entries", () => {
      for (let i = 0; i < 12; i++) {
        const id = useApiQueueStore
          .getState()
          .addToQueue({ type: "create", word: `word${i}` });
        useApiQueueStore.getState().startProcessing(id);
        useApiQueueStore.getState().completeRequest(id, { i });
      }

      expect(useApiQueueStore.getState().completedRequests).toHaveLength(10);
    });

    it("does nothing if request not in activeRequests", () => {
      useApiQueueStore.getState().completeRequest("nonexistent", {});

      expect(useApiQueueStore.getState().completedRequests).toHaveLength(0);
    });
  });

  describe("errorRequest", () => {
    it("moves active request to completed with error status", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);

      useApiQueueStore.getState().errorRequest(id, "Network error");

      expect(useApiQueueStore.getState().activeRequests).toHaveLength(0);
      expect(useApiQueueStore.getState().completedRequests).toHaveLength(1);
      expect(useApiQueueStore.getState().completedRequests[0].status).toBe(
        "error",
      );
      expect(useApiQueueStore.getState().completedRequests[0].error).toBe(
        "Network error",
      );
    });

    it("handles error for queued (not yet active) request", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });

      useApiQueueStore.getState().errorRequest(id, "Failed before processing");

      expect(useApiQueueStore.getState().queue).toHaveLength(0);
      expect(useApiQueueStore.getState().completedRequests).toHaveLength(1);
      expect(useApiQueueStore.getState().completedRequests[0].status).toBe(
        "error",
      );
    });
  });

  describe("removeFromQueue", () => {
    it("removes from queue", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });

      useApiQueueStore.getState().removeFromQueue(id);

      expect(useApiQueueStore.getState().queue).toHaveLength(0);
    });

    it("removes from activeRequests", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);

      useApiQueueStore.getState().removeFromQueue(id);

      expect(useApiQueueStore.getState().activeRequests).toHaveLength(0);
    });
  });

  describe("clearCompleted", () => {
    it("clears all completed requests", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);
      useApiQueueStore.getState().completeRequest(id, {});

      useApiQueueStore.getState().clearCompleted();

      expect(useApiQueueStore.getState().completedRequests).toHaveLength(0);
    });
  });

  describe("getRequestById", () => {
    it("finds request in queue", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });

      const request = useApiQueueStore.getState().getRequestById(id);

      expect(request).toBeDefined();
      expect(request!.word).toBe("hello");
    });

    it("finds request in activeRequests", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);

      const request = useApiQueueStore.getState().getRequestById(id);

      expect(request).toBeDefined();
      expect(request!.status).toBe("processing");
    });

    it("finds request in completedRequests", () => {
      const id = useApiQueueStore
        .getState()
        .addToQueue({ type: "create", word: "hello" });
      useApiQueueStore.getState().startProcessing(id);
      useApiQueueStore.getState().completeRequest(id, {});

      const request = useApiQueueStore.getState().getRequestById(id);

      expect(request).toBeDefined();
      expect(request!.status).toBe("completed");
    });

    it("returns undefined for unknown id", () => {
      expect(
        useApiQueueStore.getState().getRequestById("nonexistent"),
      ).toBeUndefined();
    });
  });
});
