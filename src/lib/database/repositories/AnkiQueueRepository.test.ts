import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { DatabaseCore } from "../core";
import { AnkiQueueRepository } from "./AnkiQueueRepository";
import { PendingAnkiCardRow } from "@/lib/types";

// Each test run gets its own local SQLite file (setup.ts sets USE_LOCAL_DB)
const dbPath = path.join(
  os.tmpdir(),
  `omnidict-anki-queue-test-${process.pid}-${Date.now()}.db`,
);

const USER = 42;
const OTHER_USER = 43;

let core: DatabaseCore;
let repo: AnkiQueueRepository;

async function getRow(id: number): Promise<PendingAnkiCardRow> {
  const db = core.getDatabase();
  const row = (await db
    .prepare("SELECT * FROM pending_anki_cards WHERE id = ?")
    .get(id)) as PendingAnkiCardRow | undefined;
  expect(row).toBeDefined();
  return row!;
}

async function findByDedupKey(
  refoldUserId: number,
  dedupKey: string,
): Promise<PendingAnkiCardRow> {
  const db = core.getDatabase();
  const row = (await db
    .prepare(
      "SELECT * FROM pending_anki_cards WHERE refold_user_id = ? AND dedup_key = ?",
    )
    .get(refoldUserId, dedupKey)) as PendingAnkiCardRow | undefined;
  expect(row).toBeDefined();
  return row!;
}

async function backdateClaim(id: number, modifier: string): Promise<void> {
  const db = core.getDatabase();
  await db
    .prepare(
      "UPDATE pending_anki_cards SET claimed_at = datetime('now', ?) WHERE id = ?",
    )
    .run(modifier, id);
}

beforeAll(async () => {
  process.env.USE_LOCAL_DB = "true";
  process.env.DATABASE_PATH = dbPath;
  core = new DatabaseCore();
  await core.ensureInitialized();
  repo = new AnkiQueueRepository(core);
});

afterAll(async () => {
  await core.close();
  await Promise.all(
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((file) =>
      fs.rm(file, { force: true }),
    ),
  );
});

describe("AnkiQueueRepository enqueue", () => {
  it("inserts a new card and dedups repeat enqueues", async () => {
    const first = await repo.enqueue(USER, "karta:cz", '{"headword":"karta"}');
    expect(first).toBe(true);

    const second = await repo.enqueue(USER, "karta:cz", '{"headword":"dup"}');
    expect(second).toBe(false);

    // Original context survives — the duplicate was ignored
    const row = await findByDedupKey(USER, "karta:cz");
    expect(row.context_json).toBe('{"headword":"karta"}');
    expect(row.status).toBe("queued");
    expect(row.schema_version).toBe(1);
    expect(row.attempts).toBe(0);
  });

  it("allows the same dedup key for a different user", async () => {
    expect(await repo.enqueue(OTHER_USER, "karta:cz", "{}")).toBe(true);
  });

  it("enqueues many, skipping duplicates, and reports inserted count", async () => {
    const inserted = await repo.enqueueMany(USER, [
      { dedupKey: "import:1", contextJson: "{}" },
      { dedupKey: "import:2", contextJson: "{}" },
      { dedupKey: "karta:cz", contextJson: "{}" }, // duplicate of existing
      { dedupKey: "import:2", contextJson: "{}" }, // duplicate within batch
    ]);
    expect(inserted).toBe(2);

    expect(await repo.enqueueMany(USER, [])).toBe(0);
  });
});

describe("AnkiQueueRepository listByUser", () => {
  it("filters by user and status", async () => {
    const queued = await repo.listByUser(USER, ["queued"]);
    expect(queued.length).toBeGreaterThanOrEqual(3);
    expect(queued.every((row) => row.refold_user_id === USER)).toBe(true);
    expect(queued.every((row) => row.status === "queued")).toBe(true);

    // No cards in these statuses yet
    expect(await repo.listByUser(USER, ["done", "error"])).toEqual([]);

    // Empty status list matches nothing
    expect(await repo.listByUser(USER, [])).toEqual([]);
  });
});

describe("AnkiQueueRepository claim", () => {
  it("claims a queued card once; a second claim loses", async () => {
    await repo.enqueue(USER, "claim:1", "{}");
    const { id } = await findByDedupKey(USER, "claim:1");

    expect(await repo.claim(id, "session-a")).toBe(true);

    const row = await getRow(id);
    expect(row.status).toBe("flushing");
    expect(row.claimed_by).toBe("session-a");
    expect(row.claimed_at).not.toBeNull();

    // Fresh claim is held — a competing session cannot steal it
    expect(await repo.claim(id, "session-b")).toBe(false);
    expect((await getRow(id)).claimed_by).toBe("session-a");
  });

  it("allows reclaiming a stale claim", async () => {
    await repo.enqueue(USER, "claim:stale", "{}");
    const { id } = await findByDedupKey(USER, "claim:stale");

    expect(await repo.claim(id, "session-a")).toBe(true);

    // Simulate a crashed flusher: backdate the claim past the 10 minute cutoff
    await backdateClaim(id, "-11 minutes");

    expect(await repo.claim(id, "session-b")).toBe(true);
    const row = await getRow(id);
    expect(row.status).toBe("flushing");
    expect(row.claimed_by).toBe("session-b");
  });

  it("does not treat a recent claim as stale", async () => {
    await repo.enqueue(USER, "claim:fresh", "{}");
    const { id } = await findByDedupKey(USER, "claim:fresh");

    expect(await repo.claim(id, "session-a")).toBe(true);
    await backdateClaim(id, "-9 minutes");

    expect(await repo.claim(id, "session-b")).toBe(false);
  });
});

describe("AnkiQueueRepository transitions", () => {
  it("saves media values", async () => {
    await repo.enqueue(USER, "media:1", "{}");
    const { id } = await findByDedupKey(USER, "media:1");

    await repo.saveMediaValues(id, '{"image":"img.png"}');
    const row = await getRow(id);
    expect(row.media_values_json).toBe('{"image":"img.png"}');
  });

  it("markDone records the note id, stamps flushed_at, and clears the claim", async () => {
    await repo.enqueue(USER, "done:1", "{}");
    const { id } = await findByDedupKey(USER, "done:1");
    await repo.claim(id, "session-a");

    await repo.markDone(id, 1234567);

    const row = await getRow(id);
    expect(row.status).toBe("done");
    expect(row.anki_note_id).toBe(1234567);
    expect(row.error).toBeNull();
    expect(row.flushed_at).not.toBeNull();
    expect(row.claimed_by).toBeNull();
    expect(row.claimed_at).toBeNull();
  });

  it("markDone accepts a null note id", async () => {
    await repo.enqueue(USER, "done:2", "{}");
    const { id } = await findByDedupKey(USER, "done:2");
    await repo.claim(id, "session-a");

    await repo.markDone(id, null);

    const row = await getRow(id);
    expect(row.status).toBe("done");
    expect(row.anki_note_id).toBeNull();
  });

  it("markError sets the error, increments attempts, and clears the claim", async () => {
    await repo.enqueue(USER, "error:1", "{}");
    const { id } = await findByDedupKey(USER, "error:1");
    await repo.claim(id, "session-a");

    await repo.markError(id, "AnkiConnect unreachable");

    let row = await getRow(id);
    expect(row.status).toBe("error");
    expect(row.error).toBe("AnkiConnect unreachable");
    expect(row.attempts).toBe(1);
    expect(row.claimed_by).toBeNull();
    expect(row.claimed_at).toBeNull();

    await repo.markError(id, "still unreachable");
    row = await getRow(id);
    expect(row.attempts).toBe(2);
  });

  it("release returns a claimed card to the queue", async () => {
    await repo.enqueue(USER, "release:1", "{}");
    const { id } = await findByDedupKey(USER, "release:1");
    await repo.claim(id, "session-a");

    await repo.release(id);

    const row = await getRow(id);
    expect(row.status).toBe("queued");
    expect(row.claimed_by).toBeNull();
    expect(row.claimed_at).toBeNull();

    // Released cards are claimable again
    expect(await repo.claim(id, "session-b")).toBe(true);
  });
});

describe("AnkiQueueRepository deletePending", () => {
  it("deletes a queued card for the owning user", async () => {
    await repo.enqueue(USER, "delete:1", "{}");
    const { id } = await findByDedupKey(USER, "delete:1");

    expect(await repo.deletePending(id, USER)).toBe(true);

    const db = core.getDatabase();
    const row = await db
      .prepare("SELECT id FROM pending_anki_cards WHERE id = ?")
      .get(id);
    expect(row).toBeUndefined();
  });

  it("refuses to delete another user's card", async () => {
    await repo.enqueue(USER, "delete:2", "{}");
    const { id } = await findByDedupKey(USER, "delete:2");

    expect(await repo.deletePending(id, OTHER_USER)).toBe(false);
    expect((await getRow(id)).status).toBe("queued");
  });

  it("refuses to delete a card that is currently flushing", async () => {
    await repo.enqueue(USER, "delete:3", "{}");
    const { id } = await findByDedupKey(USER, "delete:3");
    await repo.claim(id, "session-a");

    expect(await repo.deletePending(id, USER)).toBe(false);
    expect((await getRow(id)).status).toBe("flushing");

    // Once done, the card can be deleted
    await repo.markDone(id, null);
    expect(await repo.deletePending(id, USER)).toBe(true);
  });
});
