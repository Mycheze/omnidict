import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "./route";
import { getSession } from "@/lib/auth/session";
import { containsForbiddenKey } from "@/lib/sync/forbiddenKeys";
import type { SessionClaims } from "@/lib/auth/session";

const { mockGetSettings, mockPutSettings } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockPutSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  default: {
    getInstance: () => ({
      getSettings: mockGetSettings,
      putSettings: mockPutSettings,
    }),
  },
}));

const mockGetSession = vi.mocked(getSession);

const claims: SessionClaims = {
  sub: "42",
  email: "user@example.com",
  name: "Test User",
  tier: "pro",
  paid: true,
  entCheckedAt: Date.now(),
};

function makeRequest(method: "GET" | "PUT", body?: string): NextRequest {
  return new NextRequest("http://localhost:3200/api/user/settings", {
    method,
    headers: {
      "x-forwarded-for": "1.2.3.4",
      origin: "http://localhost:3200",
      host: "localhost:3200",
      "content-type": "application/json",
    },
    body,
  });
}

interface TestEnvelope {
  version: number;
  settings: Record<string, unknown>;
}

function validEnvelope(): TestEnvelope {
  return {
    version: 1,
    settings: {
      general: {
        languages: { sourceLanguage: "English", targetLanguage: "Czech" },
        preferences: { darkMode: true },
      },
      ai: { selectedProvider: "deepseek", selectedModels: {} },
      media: { enabledTypes: {}, languageConfigs: {} },
      anki: {
        enabled: false,
        deck: "",
        noteType: "",
        fieldMappings: [],
        tags: ["omnidict"],
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockGetSession.mockResolvedValue(claims);
  mockGetSettings.mockResolvedValue(null);
  mockPutSettings.mockResolvedValue(undefined);
});

describe("GET /api/user/settings", () => {
  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(401);
  });

  it("returns nulls when the user has no stored settings", async () => {
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: null, updatedAt: null });
    expect(mockGetSettings).toHaveBeenCalledWith(42);
  });

  it("returns the parsed envelope and timestamp when stored", async () => {
    const envelope = validEnvelope();
    mockGetSettings.mockResolvedValue({
      settingsJson: JSON.stringify(envelope),
      updatedAt: "2026-08-13 10:00:00",
    });

    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      settings: envelope,
      updatedAt: "2026-08-13 10:00:00",
    });
  });

  it("treats a corrupted stored row as absent", async () => {
    mockGetSettings.mockResolvedValue({
      settingsJson: "{not valid json",
      updatedAt: "2026-08-13 10:00:00",
    });

    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: null, updatedAt: null });
  });
});

describe("PUT /api/user/settings", () => {
  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    const response = await PUT(
      makeRequest("PUT", JSON.stringify(validEnvelope())),
    );
    expect(response.status).toBe(401);
    expect(mockPutSettings).not.toHaveBeenCalled();
  });

  it("stores a valid envelope for the session user", async () => {
    const envelope = validEnvelope();
    const response = await PUT(makeRequest("PUT", JSON.stringify(envelope)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockPutSettings).toHaveBeenCalledTimes(1);
    const [userId, storedJson] = mockPutSettings.mock.calls[0];
    expect(userId).toBe(42);
    expect(JSON.parse(storedJson)).toEqual(envelope);
  });

  it("rejects invalid JSON", async () => {
    const response = await PUT(makeRequest("PUT", "{oops"));
    expect(response.status).toBe(400);
    expect(mockPutSettings).not.toHaveBeenCalled();
  });

  it("rejects an envelope missing a section", async () => {
    const envelope = validEnvelope();
    delete envelope.settings.anki;
    const response = await PUT(makeRequest("PUT", JSON.stringify(envelope)));
    expect(response.status).toBe(400);
    expect(mockPutSettings).not.toHaveBeenCalled();
  });

  it("rejects a wrong version", async () => {
    const envelope = validEnvelope();
    envelope.version = 2;
    const response = await PUT(makeRequest("PUT", JSON.stringify(envelope)));
    expect(response.status).toBe(400);
    expect(mockPutSettings).not.toHaveBeenCalled();
  });

  it("rejects any payload containing an apiKey key, however deep", async () => {
    const envelope = validEnvelope();
    envelope.settings.media = {
      enabledTypes: {},
      languageConfigs: {
        Czech: { nested: [{ apiKeys: { elevenLabs: "secret" } }] },
      },
    };
    const response = await PUT(makeRequest("PUT", JSON.stringify(envelope)));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("API keys");
    expect(mockPutSettings).not.toHaveBeenCalled();
  });

  it("rejects bodies over 64KB", async () => {
    const envelope = validEnvelope();
    envelope.settings.general = { padding: "x".repeat(64 * 1024) };
    const response = await PUT(makeRequest("PUT", JSON.stringify(envelope)));
    expect(response.status).toBe(413);
    expect(mockPutSettings).not.toHaveBeenCalled();
  });
});

describe("containsForbiddenKey", () => {
  it("detects apiKey/apiKeys at any depth and casing", () => {
    expect(containsForbiddenKey({ apiKey: "x" })).toBe(true);
    expect(containsForbiddenKey({ apiKeys: {} })).toBe(true);
    expect(containsForbiddenKey({ APIKEY: "x" })).toBe(true);
    expect(containsForbiddenKey({ a: { b: [{ ApiKeys: "x" }] } })).toBe(true);
  });

  it("allows clean payloads", () => {
    expect(containsForbiddenKey(null)).toBe(false);
    expect(containsForbiddenKey("apiKey")).toBe(false);
    expect(containsForbiddenKey({ a: 1, nested: { tags: ["apiKey"] } })).toBe(
      false,
    );
    expect(containsForbiddenKey({ apiKeyStatus: true })).toBe(false);
  });
});
