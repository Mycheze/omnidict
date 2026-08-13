import { AnkiConnect, AnkiConnectError } from "./ankiConnect";
import { buildFields, generateMediaValues } from "./exportCard";
import { enqueueAnkiWrite } from "./writeQueue";
import { useAnkiStore } from "@/stores/ankiStore";
import { useMediaStore } from "@/stores/mediaStore";
import {
  useAnkiQueueStore,
  FlushSummary,
  LocalPendingCard,
} from "@/stores/ankiQueueStore";
import {
  AnkiCard,
  ApiResponse,
  ExportContext,
  MediaType,
  PendingAnkiCardRow,
} from "@/lib/types";

/**
 * Client-side queue flusher: when a device with Anki running comes online,
 * this walks the pending cards (server queue for logged-in users, plus the
 * local queue) oldest-first and exports each one through AnkiConnect.
 * Singleton per tab — a module-level flag prevents overlapping flushes.
 */

export type { FlushSummary } from "@/stores/ankiQueueStore";

/** Give up on a card after this many failed attempts */
const MAX_ATTEMPTS = 3;

let flushInProgress = false;

/** Stable per-tab id used to claim server cards */
let tabSessionId: string | null = null;
function getTabSessionId(): string {
  if (!tabSessionId) {
    tabSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
  return tabSessionId;
}

type FlushCard =
  | {
      kind: "server";
      id: number;
      status: PendingAnkiCardRow["status"];
      context: ExportContext;
      storedMediaValues: Partial<Record<MediaType, string>> | null;
      createdAt: number;
    }
  | { kind: "local"; card: LocalPendingCard; createdAt: number };

function isConnectionError(error: unknown): boolean {
  return (
    error instanceof AnkiConnectError &&
    (error.code === "CONNECTION_FAILED" ||
      error.code === "DIRECT_CONNECTION_FAILED" ||
      error.code === "NETWORK_ERROR")
  );
}

function isDuplicateError(error: unknown): boolean {
  return error instanceof Error && /duplicate/i.test(error.message);
}

/** SQLite `datetime('now')` is UTC without a timezone suffix */
function parseServerTimestamp(value: string): number {
  const parsed = Date.parse(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseContextJson(json: string): ExportContext | null {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) return null;
    const context = value as Record<string, unknown>;
    if (typeof context.headword !== "string") return null;
    return value as ExportContext;
  } catch {
    return null;
  }
}

function parseMediaValuesJson(
  json: string | null,
): Partial<Record<MediaType, string>> | null {
  if (!json) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) return null;
    return value as Partial<Record<MediaType, string>>;
  } catch {
    return null;
  }
}

async function fetchServerCards(): Promise<FlushCard[]> {
  const response = await fetch("/api/anki-queue");
  if (!response.ok) {
    throw new Error(`Failed to list pending cards: HTTP ${response.status}`);
  }
  const body: ApiResponse<PendingAnkiCardRow[]> = await response.json();
  if (!body.success || !body.data) {
    throw new Error(body.error || "Failed to list pending cards");
  }

  useAnkiQueueStore.getState().setServerPending(body.data);

  const cards: FlushCard[] = [];
  for (const row of body.data) {
    // queued rows and retryable error rows; skip cards another tab is
    // actively flushing (claim would fail anyway) — stale 'flushing' rows
    // are still attempted since the claim can steal them after 10 minutes.
    if (row.status === "error" && row.attempts >= MAX_ATTEMPTS) continue;
    const context = parseContextJson(row.context_json);
    if (!context) continue;
    cards.push({
      kind: "server",
      id: row.id,
      status: row.status,
      context,
      storedMediaValues: parseMediaValuesJson(row.media_values_json),
      createdAt: parseServerTimestamp(row.created_at),
    });
  }
  return cards;
}

async function postClaim(id: number): Promise<boolean> {
  try {
    const response = await fetch("/api/anki-queue/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sessionId: getTabSessionId() }),
    });
    if (!response.ok) return false;
    const body: ApiResponse<{ claimed: boolean }> = await response.json();
    return Boolean(body.success && body.data?.claimed);
  } catch {
    return false;
  }
}

async function postComplete(
  id: number,
  outcome: "done" | "error" | "released",
  extras: {
    ankiNoteId?: number;
    error?: string;
    mediaValues?: Partial<Record<MediaType, string>>;
  } = {},
): Promise<void> {
  try {
    const mediaValues =
      extras.mediaValues && Object.keys(extras.mediaValues).length > 0
        ? extras.mediaValues
        : undefined;
    await fetch("/api/anki-queue/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        outcome,
        ankiNoteId: extras.ankiNoteId,
        error: extras.error,
        mediaValues,
      }),
    });
  } catch (error) {
    console.warn("Failed to report flush outcome for card", id, error);
  }
}

/**
 * Flush all pending Anki cards (server queue when logged in, plus the local
 * queue), oldest first. Safe to call opportunistically — it no-ops when a
 * flush is already running, when nothing is pending, or when the Anki
 * export settings aren't configured yet.
 */
export async function flushPendingCards(opts: {
  loggedIn: boolean;
}): Promise<FlushSummary> {
  if (flushInProgress) {
    return { status: "already-running", exported: 0, failed: 0, remaining: 0 };
  }
  flushInProgress = true;

  const queueStore = useAnkiQueueStore.getState();
  queueStore.setIsFlushing(true);

  try {
    const summary = await runFlush(opts.loggedIn);
    useAnkiQueueStore.getState().setLastFlushResult(summary);
    return summary;
  } finally {
    useAnkiQueueStore.getState().setIsFlushing(false);
    flushInProgress = false;
  }
}

async function runFlush(loggedIn: boolean): Promise<FlushSummary> {
  const { deck, noteType, fieldMappings, tags } = useAnkiStore.getState();
  const configured =
    Boolean(deck) &&
    Boolean(noteType) &&
    fieldMappings.some((m) => m.deepDictField !== "none");

  // Gather work
  const cards: FlushCard[] = [];
  if (loggedIn) {
    try {
      cards.push(...(await fetchServerCards()));
    } catch (error) {
      console.warn("Could not fetch server Anki queue:", error);
    }
  }
  for (const card of useAnkiQueueStore.getState().localQueue) {
    if (card.status === "done") continue;
    if (card.status === "error" && card.attempts >= MAX_ATTEMPTS) continue;
    cards.push({ kind: "local", card, createdAt: card.createdAt });
  }
  cards.sort((a, b) => a.createdAt - b.createdAt);

  if (cards.length === 0) {
    return { status: "nothing-to-flush", exported: 0, failed: 0, remaining: 0 };
  }

  // Cards stay queued until the user finishes Anki setup
  if (!configured) {
    return {
      status: "not-configured",
      exported: 0,
      failed: 0,
      remaining: cards.length,
    };
  }

  const { enabledTypes, apiKeys, getConfigForLanguage } =
    useMediaStore.getState();
  const ankiClient = new AnkiConnect();

  let exported = 0;
  let failed = 0;
  let stopped = false;

  for (let index = 0; index < cards.length; index++) {
    const item = cards[index];
    const context = item.kind === "server" ? item.context : item.card.context;

    // Server cards must be claimed so two devices don't export twice.
    // Error rows aren't claimable directly — release them back to 'queued'
    // first so the retry can win the claim.
    if (item.kind === "server") {
      if (item.status === "error") {
        await postComplete(item.id, "released");
      }
      if (!(await postClaim(item.id))) {
        continue;
      }
    }

    // Reuse media generated on a previous attempt; otherwise generate now.
    // generateMediaValues never throws — media failures export without media.
    let mediaValues: Partial<Record<MediaType, string>>;
    let generatedMedia = false;
    if (item.kind === "server" && item.storedMediaValues) {
      mediaValues = item.storedMediaValues;
    } else {
      mediaValues = await generateMediaValues(context, ankiClient, {
        enabledTypes,
        fieldMappings,
        apiKeys,
        config: context.targetLanguage
          ? getConfigForLanguage(context.targetLanguage)
          : undefined,
      });
      generatedMedia = Object.keys(mediaValues).length > 0;
    }

    const fields = buildFields(context, fieldMappings, tags, mediaValues);
    const card: AnkiCard = {
      deckName: deck,
      modelName: noteType,
      fields,
      tags: [...tags],
    };

    try {
      const noteId = await enqueueAnkiWrite(() => ankiClient.addNote(card));

      if (item.kind === "server") {
        await postComplete(item.id, "done", {
          ankiNoteId: typeof noteId === "number" ? noteId : undefined,
          mediaValues: generatedMedia ? mediaValues : undefined,
        });
      } else {
        useAnkiQueueStore.getState().markLocal(item.card.id, {
          status: "done",
        });
      }
      exported++;
      useAnkiStore.getState().setLastExportTime(Date.now());
    } catch (error) {
      if (isDuplicateError(error)) {
        // The note already exists in Anki — mission accomplished
        if (item.kind === "server") {
          await postComplete(item.id, "done", {
            mediaValues: generatedMedia ? mediaValues : undefined,
          });
        } else {
          useAnkiQueueStore.getState().markLocal(item.card.id, {
            status: "done",
          });
        }
        exported++;
      } else if (isConnectionError(error)) {
        // Anki went away mid-flush: put the current card back and stop
        if (item.kind === "server") {
          await postComplete(item.id, "released", {
            mediaValues: generatedMedia ? mediaValues : undefined,
          });
        }
        useAnkiStore.getState().setReachable(false);
        stopped = true;
        break;
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (item.kind === "server") {
          await postComplete(item.id, "error", {
            error: message,
            mediaValues: generatedMedia ? mediaValues : undefined,
          });
        } else {
          useAnkiQueueStore.getState().markLocal(item.card.id, {
            status: "error",
            error: message,
            attempts: item.card.attempts + 1,
          });
        }
        failed++;
      }
    }
  }

  // Drop successfully exported local cards and refresh the server cache
  useAnkiQueueStore.getState().clearFlushed();
  if (loggedIn) {
    try {
      await fetchServerCards();
    } catch {
      // Cache refresh is best-effort
    }
  }

  const remaining = cards.length - exported;
  return {
    status: stopped ? "connection-lost" : "completed",
    exported,
    failed,
    remaining,
  };
}
