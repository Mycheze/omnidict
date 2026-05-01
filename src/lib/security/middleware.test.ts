import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  withSecurity,
  DEFAULT_SECURITY,
  STRICT_SECURITY,
  RELAXED_SECURITY,
} from "./middleware";
import * as validation from "./validation";

// Mock validation functions
vi.mock("./validation", async () => {
  const actual = await vi.importActual("./validation");
  return {
    ...actual,
    checkRateLimit: vi.fn(() => true),
    validateOrigin: vi.fn(() => true),
  };
});

const mockCheckRateLimit = vi.mocked(validation.checkRateLimit);
const mockValidateOrigin = vi.mocked(validation.validateOrigin);

function makeRequest(
  method = "GET",
  headers: Record<string, string> = {},
): NextRequest {
  const defaultHeaders: Record<string, string> = {
    "x-forwarded-for": "1.2.3.4",
    origin: "http://localhost:3200",
    host: "localhost:3200",
    ...headers,
  };
  return new NextRequest("http://localhost:3200/api/test", {
    method,
    headers: defaultHeaders,
  });
}

describe("withSecurity", () => {
  let mockHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue(true);
    mockValidateOrigin.mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockHandler = vi.fn(() =>
      Promise.resolve(NextResponse.json({ success: true })),
    );
  });

  describe("rate limiting", () => {
    it("allows requests when under rate limit", async () => {
      const handler = withSecurity(mockHandler, {
        rateLimit: { maxRequests: 100, windowMs: 60000 },
      });

      const response = await handler(makeRequest());

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it("returns 429 when rate limit exceeded", async () => {
      mockCheckRateLimit.mockReturnValue(false);

      const handler = withSecurity(mockHandler, {
        rateLimit: { maxRequests: 10, windowMs: 60000 },
      });

      const response = await handler(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.error).toContain("Too many requests");
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("extracts IP from x-forwarded-for header", async () => {
      const handler = withSecurity(mockHandler, {
        rateLimit: { maxRequests: 100, windowMs: 60000 },
      });

      await handler(
        makeRequest("GET", { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }),
      );

      expect(mockCheckRateLimit).toHaveBeenCalledWith("10.0.0.1", 100, 60000);
    });

    it("falls back to x-real-ip when x-forwarded-for missing", async () => {
      const handler = withSecurity(mockHandler, {
        rateLimit: { maxRequests: 100, windowMs: 60000 },
      });

      const req = new NextRequest("http://localhost:3200/api/test", {
        method: "GET",
        headers: { "x-real-ip": "10.0.0.5" },
      });

      await handler(req);

      expect(mockCheckRateLimit).toHaveBeenCalledWith("10.0.0.5", 100, 60000);
    });

    it("skips rate limiting when not configured", async () => {
      const handler = withSecurity(mockHandler, {});

      await handler(makeRequest());

      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe("CSRF / origin validation", () => {
    it("rejects POST with invalid origin", async () => {
      mockValidateOrigin.mockReturnValue(false);

      const handler = withSecurity(mockHandler, {
        requireOriginValidation: true,
      });

      const response = await handler(makeRequest("POST"));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("Invalid request origin");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("allows GET even with invalid origin", async () => {
      mockValidateOrigin.mockReturnValue(false);

      const handler = withSecurity(mockHandler, {
        requireOriginValidation: true,
      });

      const response = await handler(makeRequest("GET"));

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it("validates origin for PUT, DELETE, PATCH", async () => {
      mockValidateOrigin.mockReturnValue(false);

      const handler = withSecurity(mockHandler, {
        requireOriginValidation: true,
      });

      for (const method of ["PUT", "DELETE", "PATCH"]) {
        mockHandler.mockClear();
        const response = await handler(makeRequest(method));
        expect(response.status).toBe(403);
        expect(mockHandler).not.toHaveBeenCalled();
      }
    });

    it("skips origin validation when not configured", async () => {
      const handler = withSecurity(mockHandler, {});

      await handler(makeRequest("POST"));

      expect(mockValidateOrigin).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe("security headers", () => {
    it("adds security headers to successful response", async () => {
      const handler = withSecurity(mockHandler, {});

      const response = await handler(makeRequest());

      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("X-XSS-Protection")).toBe("1; mode=block");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("adds timing header to response", async () => {
      const handler = withSecurity(mockHandler, {});

      const response = await handler(makeRequest());

      expect(response.headers.get("X-Response-Time")).toMatch(/^\d+ms$/);
    });
  });

  describe("error handling", () => {
    it("returns sanitized error on handler throw", async () => {
      mockHandler.mockRejectedValue(new Error("Internal DB failure"));

      const handler = withSecurity(mockHandler, {});

      const response = await handler(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Internal DB failure");
    });

    it("returns 400 for validation errors", async () => {
      mockHandler.mockRejectedValue(
        new Error("Validation failed: word is required"),
      );

      const handler = withSecurity(mockHandler, {});

      const response = await handler(makeRequest());

      expect(response.status).toBe(400);
    });

    it("logs errors by default", async () => {
      mockHandler.mockRejectedValue(new Error("test error"));

      const handler = withSecurity(mockHandler, {});
      await handler(makeRequest());

      expect(console.error).toHaveBeenCalled();
    });

    it("suppresses logging when logErrors is false", async () => {
      mockHandler.mockRejectedValue(new Error("test error"));

      const handler = withSecurity(mockHandler, { logErrors: false });
      await handler(makeRequest());

      expect(console.error).not.toHaveBeenCalled();
    });

    it("adds timing header to error responses", async () => {
      mockHandler.mockRejectedValue(new Error("fail"));

      const handler = withSecurity(mockHandler, {});
      const response = await handler(makeRequest());

      expect(response.headers.get("X-Response-Time")).toMatch(/^\d+ms$/);
    });
  });

  describe("predefined configurations", () => {
    it("DEFAULT_SECURITY has expected values", () => {
      expect(DEFAULT_SECURITY.rateLimit.maxRequests).toBe(100);
      expect(DEFAULT_SECURITY.requireOriginValidation).toBe(true);
    });

    it("STRICT_SECURITY has lower rate limits", () => {
      expect(STRICT_SECURITY.rateLimit.maxRequests).toBe(50);
      expect(STRICT_SECURITY.requireOriginValidation).toBe(true);
    });

    it("RELAXED_SECURITY has higher rate limits and no CSRF", () => {
      expect(RELAXED_SECURITY.rateLimit.maxRequests).toBe(200);
      expect(RELAXED_SECURITY.requireOriginValidation).toBe(false);
    });
  });
});
