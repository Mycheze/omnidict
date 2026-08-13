import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { DatabaseCore } from "../core";
import { UserRepository } from "./UserRepository";

// Each test run gets its own local SQLite file (setup.ts sets USE_LOCAL_DB)
const dbPath = path.join(
  os.tmpdir(),
  `omnidict-user-repo-test-${process.pid}-${Date.now()}.db`,
);

let core: DatabaseCore;
let repo: UserRepository;

beforeAll(async () => {
  process.env.USE_LOCAL_DB = "true";
  process.env.DATABASE_PATH = dbPath;
  core = new DatabaseCore();
  await core.ensureInitialized();
  repo = new UserRepository(core);
});

afterAll(async () => {
  await core.close();
  await Promise.all(
    [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((file) =>
      fs.rm(file, { force: true }),
    ),
  );
});

describe("UserRepository users", () => {
  it("upserts and reads back a user", async () => {
    await repo.upsertUser({
      refoldUserId: 1,
      email: "ada@example.com",
      name: "Ada",
      tier: "pro",
      paid: true,
    });

    const user = await repo.getUser(1);
    expect(user).not.toBeNull();
    expect(user!.refold_user_id).toBe(1);
    expect(user!.email).toBe("ada@example.com");
    expect(user!.name).toBe("Ada");
    expect(user!.tier).toBe("pro");
    expect(user!.paid).toBe(1);
    expect(user!.entitlements_checked_at).not.toBeNull();
    expect(user!.last_login_at).not.toBeNull();
    expect(user!.created_at).not.toBeNull();
  });

  it("updates an existing user on repeat upsert without duplicating", async () => {
    await repo.upsertUser({
      refoldUserId: 1,
      email: "ada@new.example.com",
      name: null,
      tier: "free",
      paid: false,
    });

    const user = await repo.getUser(1);
    expect(user!.email).toBe("ada@new.example.com");
    expect(user!.name).toBeNull();
    expect(user!.tier).toBe("free");
    expect(user!.paid).toBe(0);

    const db = core.getDatabase();
    const count = (await db
      .prepare("SELECT COUNT(*) as count FROM users WHERE refold_user_id = 1")
      .get()) as { count: number };
    expect(count.count).toBe(1);
  });

  it("returns null for an unknown user", async () => {
    expect(await repo.getUser(999999)).toBeNull();
  });

  it("updates entitlements", async () => {
    const updated = await repo.updateEntitlements(1, "pro", true);
    expect(updated).toBe(true);

    const user = await repo.getUser(1);
    expect(user!.tier).toBe("pro");
    expect(user!.paid).toBe(1);

    expect(await repo.updateEntitlements(999999, "pro", true)).toBe(false);
  });
});

describe("UserRepository settings", () => {
  it("roundtrips settings and overwrites on repeat put", async () => {
    await repo.upsertUser({
      refoldUserId: 2,
      email: "settings@example.com",
      name: "Settings User",
      tier: "free",
      paid: false,
    });

    expect(await repo.getSettings(2)).toBeNull();

    await repo.putSettings(2, JSON.stringify({ theme: "dark" }));
    const first = await repo.getSettings(2);
    expect(first).not.toBeNull();
    expect(JSON.parse(first!.settingsJson)).toEqual({ theme: "dark" });
    expect(first!.updatedAt).toBeTruthy();

    await repo.putSettings(2, JSON.stringify({ theme: "light" }));
    const second = await repo.getSettings(2);
    expect(JSON.parse(second!.settingsJson)).toEqual({ theme: "light" });
  });
});

describe("UserRepository quotas", () => {
  const period = "2026-08";
  const limits = { imageLimit: 10, ttsLimit: 10 };

  beforeAll(async () => {
    await repo.upsertUser({
      refoldUserId: 3,
      email: "quota@example.com",
      name: "Quota User",
      tier: "free",
      paid: false,
    });
    await repo.upsertUser({
      refoldUserId: 4,
      email: "quota2@example.com",
      name: "Quota User 2",
      tier: "free",
      paid: false,
    });
    await repo.upsertUser({
      refoldUserId: 5,
      email: "quota3@example.com",
      name: "Quota User 3",
      tier: "free",
      paid: false,
    });
  });

  it("consumes within the limit and records usage", async () => {
    const ok = await repo.tryConsumeQuota(3, period, 2, 3, limits);
    expect(ok).toBe(true);

    const usage = await repo.getUsage(3, period);
    expect(usage).not.toBeNull();
    expect(usage!.images_used).toBe(2);
    expect(usage!.tts_used).toBe(3);
  });

  it("rejects consumption exceeding a limit and leaves usage unchanged", async () => {
    const ok = await repo.tryConsumeQuota(3, period, 9, 0, limits);
    expect(ok).toBe(false);

    const usage = await repo.getUsage(3, period);
    expect(usage!.images_used).toBe(2);
    expect(usage!.tts_used).toBe(3);
  });

  it("allows consuming exactly up to the limit, then rejects one more", async () => {
    expect(await repo.tryConsumeQuota(4, period, 10, 0, limits)).toBe(true);
    expect(await repo.tryConsumeQuota(4, period, 1, 0, limits)).toBe(false);

    const usage = await repo.getUsage(4, period);
    expect(usage!.images_used).toBe(10);
  });

  it("serializes concurrent consumes so only one wins at the boundary", async () => {
    // Two overlapping consumes of 6 against a limit of 10: without the
    // transaction both read 0 and both would pass the check
    const results = await Promise.all([
      repo.tryConsumeQuota(5, period, 6, 0, limits),
      repo.tryConsumeQuota(5, period, 6, 0, limits),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);

    const usage = await repo.getUsage(5, period);
    expect(usage!.images_used).toBe(6);
  });

  it("refunds usage and floors at zero", async () => {
    await repo.refundQuota(3, period, 1, 0);
    let usage = await repo.getUsage(3, period);
    expect(usage!.images_used).toBe(1);

    // Refund more than was consumed — both counters floor at 0
    await repo.refundQuota(3, period, 100, 100);
    usage = await repo.getUsage(3, period);
    expect(usage!.images_used).toBe(0);
    expect(usage!.tts_used).toBe(0);
  });

  it("returns null usage for an untouched period", async () => {
    expect(await repo.getUsage(3, "1999-01")).toBeNull();
  });
});
