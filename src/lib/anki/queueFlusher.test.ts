import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPendingCards } from "./queueFlusher";
import { AnkiConnectError } from "./ankiConnect";
import { useAnkiStore } from "@/stores/ankiStore";
import { useAnkiQueueStore, LocalPendingCard } from "@/stores/ankiQueueStore";
import { useMediaStore } from "@/stores/mediaStore";
import { ExportContext, PendingAnkiCardRow } from "@/lib/types";

const { addNoteMock, storeMediaFileMock } = vi.hoisted(() => ({
  addNoteMock: vi.fn(),
  storeMediaFileMock: vi.fn(),
}));

vi.mock("./ankiConnect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ankiConnect")>();
  return {
    ...actual,
    AnkiConnect: class {
      addNote = addNoteMock;
      storeMediaFile = storeMediaFileMock;
    },
  };
});

const context: ExportContext = {
  headword: "kočka",
  definition: "a cat",
  partOfSpeech: "noun",
  example: "Kočka spí.",
  targetLanguage: "Czech",
};

function makeLocalCard(overrides: Partial<LocalPendingCard>): LocalPendingCard {
  return {
    id: "local-1",
    dedupKey: "key-1",
    context,
    status: "queued",
    attempts: 0,
    createdAt: 1000,
    ...overrides,
  };
}

function makeServerRow(
  overrides: Partial<PendingAnkiCardRow>,
): PendingAnkiCardRow {
  return {
    id: 1,
    refold_user_id: 7,
    dedup_key: "server-key-1",
    schema_version: 1,
    context_json: JSON.stringify(context),
    status: "queued",
    media_values_json: null,
    anki_note_id: null,
    error: null,
    attempts: 0,
    claimed_by: null,
    claimed_at: null,
    created_at: "2026-08-13 10:00:00",
    updated_at: "2026-08-13 10:00:00",
    flushed_at: null,
    ...overrides,
  };
}

/** Simple fetch router covering the queue API + media generation */
let serverRows: PendingAnkiCardRow[] = [];
let claimResult = true;
let mediaGenerateOk = false;

const fetchMock = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const jsonResponse = (body: unknown, ok = true, status = 200) => ({
      ok,
      status,
      json: async () => body,
    });

    if (url === "/api/anki-queue" && (!init?.method || init.method === "GET")) {
      return jsonResponse({ success: true, data: serverRows });
    }
    if (url === "/api/anki-queue/claim") {
      return jsonResponse({ success: true, data: { claimed: claimResult } });
    }
    if (url === "/api/anki-queue/complete") {
      return jsonResponse({ success: true, data: {} });
    }
    if (url === "/api/media/generate") {
      if (!mediaGenerateOk) {
        return jsonResponse(
          { success: false, error: "media provider down" },
          false,
          500,
        );
      }
      return jsonResponse({
        success: true,
        data: {
          image: { filename: "img.jpg", data: "base64" },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  },
);

function completeCalls(): Array<{ id: number; outcome: string }> {
  return fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/anki-queue/complete")
    .map(([, init]) => JSON.parse(String(init?.body)));
}

describe("flushPendingCards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockClear();
    addNoteMock.mockReset();
    storeMediaFileMock.mockReset().mockResolvedValue("stored");
    serverRows = [];
    claimResult = true;
    mediaGenerateOk = false;

    useAnkiStore.setState({
      enabled: true,
      reachable: true,
      deck: "MyDeck",
      noteType: "Basic",
      fieldMappings: [{ ankiField: "Front", deepDictField: "headword" }],
      tags: ["omnidict"],
    });
    useAnkiQueueStore.setState({
      localQueue: [],
      isFlushing: false,
      lastFlushResult: null,
      serverPending: [],
    });
    useMediaStore.setState({
      enabledTypes: { image: false, wordAudio: false, sentenceAudio: false },
      apiKeys: { elevenLabs: "", replicate: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports a local card and removes it from the queue", async () => {
    useAnkiQueueStore.setState({ localQueue: [makeLocalCard({})] });
    addNoteMock.mockResolvedValue(123);

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary).toMatchObject({
      status: "completed",
      exported: 1,
      failed: 0,
      remaining: 0,
    });
    expect(addNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deckName: "MyDeck",
        modelName: "Basic",
        fields: { Front: "kočka" },
      }),
    );
    expect(useAnkiQueueStore.getState().localQueue).toHaveLength(0);
    // Anonymous flush never touches the server queue API
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/anki-queue"),
      ),
    ).toHaveLength(0);
  });

  it("claims a server card and reports done with the note id", async () => {
    serverRows = [makeServerRow({ id: 11 })];
    addNoteMock.mockResolvedValue(42);

    const summary = await flushPendingCards({ loggedIn: true });

    expect(summary).toMatchObject({ status: "completed", exported: 1 });
    const claims = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/anki-queue/claim",
    );
    expect(claims).toHaveLength(1);
    expect(JSON.parse(String(claims[0][1]?.body))).toMatchObject({ id: 11 });
    expect(completeCalls()).toEqual([
      expect.objectContaining({ id: 11, outcome: "done", ankiNoteId: 42 }),
    ]);
  });

  it("skips server cards whose claim is lost to another flusher", async () => {
    serverRows = [makeServerRow({ id: 11 })];
    claimResult = false;

    const summary = await flushPendingCards({ loggedIn: true });

    expect(addNoteMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ exported: 0, remaining: 1 });
  });

  it("treats an Anki duplicate error as success", async () => {
    useAnkiQueueStore.setState({ localQueue: [makeLocalCard({})] });
    addNoteMock.mockRejectedValue(
      new Error("cannot create note because it is a duplicate"),
    );

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary).toMatchObject({ status: "completed", exported: 1 });
    expect(useAnkiQueueStore.getState().localQueue).toHaveLength(0);
  });

  it("marks a failed card as error and continues with the next", async () => {
    useAnkiQueueStore.setState({
      localQueue: [
        makeLocalCard({ id: "a", dedupKey: "ka", createdAt: 1000 }),
        makeLocalCard({ id: "b", dedupKey: "kb", createdAt: 2000 }),
      ],
    });
    addNoteMock
      .mockRejectedValueOnce(new AnkiConnectError("deck was not found"))
      .mockResolvedValueOnce(55);

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary).toMatchObject({
      status: "completed",
      exported: 1,
      failed: 1,
      remaining: 1,
    });
    const queue = useAnkiQueueStore.getState().localQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: "a",
      status: "error",
      error: "deck was not found",
      attempts: 1,
    });
  });

  it("releases the current server card and stops on a connection failure", async () => {
    serverRows = [
      makeServerRow({ id: 11, created_at: "2026-08-13 10:00:00" }),
      makeServerRow({
        id: 12,
        dedup_key: "server-key-2",
        created_at: "2026-08-13 11:00:00",
      }),
    ];
    addNoteMock.mockRejectedValue(
      new AnkiConnectError("Unable to connect", "CONNECTION_FAILED"),
    );

    const summary = await flushPendingCards({ loggedIn: true });

    expect(summary).toMatchObject({
      status: "connection-lost",
      exported: 0,
      remaining: 2,
    });
    // Only the first card was attempted, and it was released
    expect(addNoteMock).toHaveBeenCalledTimes(1);
    expect(completeCalls()).toEqual([
      expect.objectContaining({ id: 11, outcome: "released" }),
    ]);
    expect(useAnkiStore.getState().reachable).toBe(false);
  });

  it("still exports the card when media generation fails", async () => {
    useMediaStore.setState({
      enabledTypes: { image: true, wordAudio: false, sentenceAudio: false },
      apiKeys: { elevenLabs: "", replicate: "key" },
    });
    useAnkiStore.setState({
      fieldMappings: [
        { ankiField: "Front", deepDictField: "headword" },
        { ankiField: "Picture", deepDictField: "image" },
      ],
    });
    useAnkiQueueStore.setState({ localQueue: [makeLocalCard({})] });
    mediaGenerateOk = false;
    addNoteMock.mockResolvedValue(9);

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary).toMatchObject({ status: "completed", exported: 1 });
    expect(addNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: { Front: "kočka", Picture: "" },
      }),
    );
  });

  it("reuses stored media values from the server row without regenerating", async () => {
    useMediaStore.setState({
      enabledTypes: { image: true, wordAudio: false, sentenceAudio: false },
      apiKeys: { elevenLabs: "", replicate: "key" },
    });
    useAnkiStore.setState({
      fieldMappings: [
        { ankiField: "Front", deepDictField: "headword" },
        { ankiField: "Picture", deepDictField: "image" },
      ],
    });
    serverRows = [
      makeServerRow({
        id: 21,
        media_values_json: JSON.stringify({ image: '<img src="img.jpg">' }),
      }),
    ];
    addNoteMock.mockResolvedValue(77);

    await flushPendingCards({ loggedIn: true });

    expect(addNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: { Front: "kočka", Picture: '<img src="img.jpg">' },
      }),
    );
    // Media API never called — the stored values were reused
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => String(url) === "/api/media/generate",
      ),
    ).toHaveLength(0);
  });

  it("stops entirely when Anki export settings are not configured", async () => {
    useAnkiStore.setState({ deck: "" });
    useAnkiQueueStore.setState({ localQueue: [makeLocalCard({})] });

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary).toMatchObject({ status: "not-configured", remaining: 1 });
    expect(addNoteMock).not.toHaveBeenCalled();
    expect(useAnkiQueueStore.getState().localQueue[0].status).toBe("queued");
  });

  it("skips cards that already exhausted their attempts", async () => {
    useAnkiQueueStore.setState({
      localQueue: [makeLocalCard({ id: "a", status: "error", attempts: 3 })],
    });

    const summary = await flushPendingCards({ loggedIn: false });

    expect(summary.status).toBe("nothing-to-flush");
    expect(addNoteMock).not.toHaveBeenCalled();
  });

  it("refuses to run two flushes at once", async () => {
    useAnkiQueueStore.setState({ localQueue: [makeLocalCard({})] });
    let resolveAddNote: (value: number) => void = () => {};
    addNoteMock.mockImplementation(
      () => new Promise<number>((resolve) => (resolveAddNote = resolve)),
    );

    const first = flushPendingCards({ loggedIn: false });
    // Let the first flush reach the in-progress addNote call
    await vi.waitFor(() => expect(addNoteMock).toHaveBeenCalled());

    const second = await flushPendingCards({ loggedIn: false });
    expect(second.status).toBe("already-running");

    resolveAddNote(1);
    const summary = await first;
    expect(summary.status).toBe("completed");
  });
});
