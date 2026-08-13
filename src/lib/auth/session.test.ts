import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  SessionClaims,
} from "./session";

const TEST_SECRET = "test-session-secret";

function makeClaims(overrides?: Partial<SessionClaims>): SessionClaims {
  return {
    sub: "42",
    email: "learner@example.com",
    name: "Test Learner",
    tier: "toolkit",
    paid: true,
    entCheckedAt: 1755000000000,
    ...overrides,
  };
}

describe("session", () => {
  beforeEach(() => {
    vi.stubEnv("OMNIDICT_SESSION_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("roundtrips claims through create/verify", async () => {
    const claims = makeClaims();
    const token = await createSessionToken(claims);
    const verified = await verifySessionToken(token);

    expect(verified).toEqual(claims);
  });

  it("returns null for an expired token", async () => {
    const token = await createSessionToken(makeClaims(), 0);

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
    expect(await verifySessionToken("a.b.c")).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await createSessionToken(makeClaims());
    vi.stubEnv("OMNIDICT_SESSION_SECRET", "some-other-secret");

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null when the session secret is missing", async () => {
    const token = await createSessionToken(makeClaims());
    vi.stubEnv("OMNIDICT_SESSION_SECRET", "");

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("throws on create when the session secret is missing", async () => {
    vi.stubEnv("OMNIDICT_SESSION_SECRET", "");

    await expect(createSessionToken(makeClaims())).rejects.toThrow();
  });
});
