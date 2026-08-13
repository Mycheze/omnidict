import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MediaService,
  computeQuotaRequest,
  currentUsagePeriod,
  getMediaQuotaLimits,
  MediaGenerationParams,
} from "./MediaService";
import { synthesizeElevenLabs } from "@/lib/media/elevenLabs";
import { renderImage } from "@/lib/media/replicate";
import { synthesizeGoogleTts } from "@/lib/media/googleTts";
import { LanguageMediaConfig, MediaType } from "@/lib/types";

vi.mock("@/lib/media/cache", () => ({
  readCachedMedia: vi.fn(async () => null),
  readCachedText: vi.fn(async () => null),
  writeCachedMedia: vi.fn(async () => {}),
  writeCachedText: vi.fn(async () => {}),
  sanitizeForFilename: (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  shortHash: () => "abcd1234",
}));

vi.mock("@/lib/media/elevenLabs", () => ({
  synthesizeElevenLabs: vi.fn(async () => Buffer.from("el-audio")),
}));

vi.mock("@/lib/media/replicate", () => ({
  renderImage: vi.fn(async () => Buffer.from("image-bytes")),
}));

vi.mock("@/lib/media/googleTts", () => ({
  synthesizeGoogleTts: vi.fn(async () => Buffer.from("g-audio")),
}));

vi.mock("@/lib/ai", () => ({
  default: {
    getInstance: () => ({
      generateImagePrompt: vi.fn(async () => "a vivid scene"),
    }),
  },
}));

const mockElevenLabs = vi.mocked(synthesizeElevenLabs);
const mockRenderImage = vi.mocked(renderImage);
const mockGoogleTts = vi.mocked(synthesizeGoogleTts);

const baseConfig: LanguageMediaConfig = {
  googleLanguageCode: "cs-CZ",
  googleVoiceName: "",
  elevenLabsVoiceId: "voice-1",
  elevenLabsLanguageCode: "cs",
  elevenLabsSpeed: 0.85,
  imageStyle: "gothic",
};

function makeParams(
  types: MediaType[],
  overrides: Partial<MediaGenerationParams> = {},
): MediaGenerationParams {
  return {
    types,
    headword: "kočka",
    definition: "a small domesticated feline",
    sentence: "Kočka spí na gauči.",
    targetLanguage: "Czech",
    useServerKeys: false,
    config: baseConfig,
    ...overrides,
  };
}

describe("computeQuotaRequest", () => {
  it("counts an image request", () => {
    expect(computeQuotaRequest(["image"])).toEqual({ imagesReq: 1, ttsReq: 0 });
  });

  it("does not count wordAudio (Google TTS is free)", () => {
    expect(computeQuotaRequest(["wordAudio"])).toEqual({
      imagesReq: 0,
      ttsReq: 0,
    });
  });

  it("counts sentenceAudio toward the TTS quota (ElevenLabs)", () => {
    expect(computeQuotaRequest(["sentenceAudio"])).toEqual({
      imagesReq: 0,
      ttsReq: 1,
    });
  });

  it("counts all three types as one image + one tts", () => {
    expect(
      computeQuotaRequest(["image", "wordAudio", "sentenceAudio"]),
    ).toEqual({ imagesReq: 1, ttsReq: 1 });
  });

  it("deduplicates repeated types", () => {
    expect(computeQuotaRequest(["image", "image", "sentenceAudio"])).toEqual({
      imagesReq: 1,
      ttsReq: 1,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(computeQuotaRequest([])).toEqual({ imagesReq: 0, ttsReq: 0 });
  });
});

describe("getMediaQuotaLimits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 300 images / 600 tts", () => {
    vi.stubEnv("MEDIA_QUOTA_IMAGES_PER_MONTH", "");
    vi.stubEnv("MEDIA_QUOTA_TTS_PER_MONTH", "");
    expect(getMediaQuotaLimits()).toEqual({ imageLimit: 300, ttsLimit: 600 });
  });

  it("reads limits from env", () => {
    vi.stubEnv("MEDIA_QUOTA_IMAGES_PER_MONTH", "50");
    vi.stubEnv("MEDIA_QUOTA_TTS_PER_MONTH", "120");
    expect(getMediaQuotaLimits()).toEqual({ imageLimit: 50, ttsLimit: 120 });
  });

  it("falls back on invalid values", () => {
    vi.stubEnv("MEDIA_QUOTA_IMAGES_PER_MONTH", "not-a-number");
    vi.stubEnv("MEDIA_QUOTA_TTS_PER_MONTH", "-5");
    expect(getMediaQuotaLimits()).toEqual({ imageLimit: 300, ttsLimit: 600 });
  });
});

describe("currentUsagePeriod", () => {
  it("formats as UTC YYYY-MM with zero padding", () => {
    expect(currentUsagePeriod(new Date(Date.UTC(2026, 0, 5)))).toBe("2026-01");
    expect(currentUsagePeriod(new Date(Date.UTC(2026, 11, 31)))).toBe(
      "2026-12",
    );
  });

  it("uses the UTC month, not local time", () => {
    // Last instant of July UTC must still be July regardless of local zone
    expect(currentUsagePeriod(new Date(Date.UTC(2026, 6, 31, 23, 59)))).toBe(
      "2026-07",
    );
  });
});

describe("MediaService key selection", () => {
  const service = MediaService.getInstance();

  beforeEach(() => {
    vi.clearAllMocks();
    // generate() logs each per-type failure — keep test output quiet
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("GOOGLE_TTS_API_KEY", "g-key");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("useServerKeys: true", () => {
    it("uses the server ElevenLabs key", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "server-el-key");
      const result = await service.generate(
        makeParams(["sentenceAudio"], { useServerKeys: true }),
      );

      expect(result.errors).toBeUndefined();
      expect(result.sentenceAudio).toBeDefined();
      expect(mockElevenLabs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "server-el-key" }),
      );
    });

    it("uses the server Replicate token", async () => {
      vi.stubEnv("REPLICATE_API_TOKEN", "server-r8-token");
      const result = await service.generate(
        makeParams(["image"], { useServerKeys: true }),
      );

      expect(result.errors).toBeUndefined();
      expect(result.image).toBeDefined();
      expect(mockRenderImage).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "server-r8-token" }),
      );
    });

    it("ignores user keys even when supplied", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "server-el-key");
      await service.generate(
        makeParams(["sentenceAudio"], {
          useServerKeys: true,
          apiKeys: { elevenLabs: "user-el-key" },
        }),
      );

      expect(mockElevenLabs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "server-el-key" }),
      );
    });

    it("errors per type when a server key is missing", async () => {
      const result = await service.generate(
        makeParams(["sentenceAudio", "image"], { useServerKeys: true }),
      );

      expect(result.errors?.sentenceAudio).toBe(
        "Server API key not configured",
      );
      expect(result.errors?.image).toBe("Server API key not configured");
      expect(mockElevenLabs).not.toHaveBeenCalled();
      expect(mockRenderImage).not.toHaveBeenCalled();
    });
  });

  describe("useServerKeys: false", () => {
    it("uses the user's keys", async () => {
      const result = await service.generate(
        makeParams(["sentenceAudio", "image"], {
          apiKeys: { elevenLabs: "user-el-key", replicate: "user-r8-token" },
        }),
      );

      expect(result.errors).toBeUndefined();
      expect(mockElevenLabs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "user-el-key" }),
      );
      expect(mockRenderImage).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "user-r8-token" }),
      );
    });

    it("never falls back to env keys for user-billed requests", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "server-el-key");
      vi.stubEnv("REPLICATE_API_TOKEN", "server-r8-token");

      const result = await service.generate(
        makeParams(["sentenceAudio", "image"]),
      );

      expect(result.errors?.sentenceAudio).toBe("KEY_REQUIRED: elevenLabs");
      expect(result.errors?.image).toBe("KEY_REQUIRED: replicate");
      expect(mockElevenLabs).not.toHaveBeenCalled();
      expect(mockRenderImage).not.toHaveBeenCalled();
    });

    it("reports KEY_REQUIRED per missing provider only", async () => {
      const result = await service.generate(
        makeParams(["sentenceAudio", "image"], {
          apiKeys: { elevenLabs: "user-el-key" },
        }),
      );

      expect(result.sentenceAudio).toBeDefined();
      expect(result.errors?.sentenceAudio).toBeUndefined();
      expect(result.errors?.image).toBe("KEY_REQUIRED: replicate");
    });
  });

  describe("Google TTS (wordAudio)", () => {
    it("uses the env key regardless of useServerKeys", async () => {
      for (const useServerKeys of [true, false]) {
        mockGoogleTts.mockClear();
        const result = await service.generate(
          makeParams(["wordAudio"], { useServerKeys }),
        );
        expect(result.errors).toBeUndefined();
        expect(result.wordAudio).toBeDefined();
        expect(mockGoogleTts).toHaveBeenCalledWith(
          expect.objectContaining({ apiKey: "g-key" }),
        );
      }
    });
  });
});
