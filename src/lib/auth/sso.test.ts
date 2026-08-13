import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { buildSsoRequest, verifySsoResponse } from "./sso";

const TEST_SECRET = "test-sso-secret";

/**
 * Build a response payload the same way the Refold SSO route does:
 * base64(URLSearchParams) signed with hex HMAC-SHA256 over the base64 string.
 */
function buildRefoldResponse(
  fields: Record<string, string>,
  secret: string = TEST_SECRET,
): { payload: string; sig: string } {
  const payload = Buffer.from(new URLSearchParams(fields).toString()).toString(
    "base64",
  );
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { payload, sig };
}

function validFields(overrides?: Record<string, string>) {
  return {
    nonce: "abc123",
    external_id: "42",
    email: "learner@example.com",
    name: "Test Learner",
    tier: "toolkit",
    paid: "1",
    ...overrides,
  };
}

describe("sso", () => {
  beforeEach(() => {
    vi.stubEnv("OMNIDICT_SSO_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("buildSsoRequest", () => {
    it("builds a base64 payload with nonce and return_url, signed with HMAC", () => {
      const { payload, sig } = buildSsoRequest(
        "nonce-1",
        "http://localhost:3200/api/auth/callback",
      );

      const decoded = new URLSearchParams(
        Buffer.from(payload, "base64").toString("utf-8"),
      );
      expect(decoded.get("nonce")).toBe("nonce-1");
      expect(decoded.get("return_url")).toBe(
        "http://localhost:3200/api/auth/callback",
      );

      const expectedSig = crypto
        .createHmac("sha256", TEST_SECRET)
        .update(payload)
        .digest("hex");
      expect(sig).toBe(expectedSig);
    });

    it("throws when the SSO secret is missing", () => {
      vi.stubEnv("OMNIDICT_SSO_SECRET", "");
      expect(() => buildSsoRequest("n", "http://localhost:3200")).toThrow();
    });
  });

  describe("verifySsoResponse", () => {
    it("roundtrips a Refold-format response payload", () => {
      const { payload, sig } = buildRefoldResponse(validFields());

      const user = verifySsoResponse(payload, sig);
      expect(user).toEqual({
        nonce: "abc123",
        refoldUserId: 42,
        email: "learner@example.com",
        name: "Test Learner",
        tier: "toolkit",
        paid: true,
      });
    });

    it("parses paid=0 as false", () => {
      const { payload, sig } = buildRefoldResponse(validFields({ paid: "0" }));
      expect(verifySsoResponse(payload, sig)?.paid).toBe(false);
    });

    it("returns null for a tampered signature", () => {
      const { payload, sig } = buildRefoldResponse(validFields());
      const tamperedSig = (sig[0] === "0" ? "1" : "0") + sig.slice(1);

      expect(verifySsoResponse(payload, tamperedSig)).toBeNull();
    });

    it("returns null for a signature of the wrong length", () => {
      const { payload } = buildRefoldResponse(validFields());
      expect(verifySsoResponse(payload, "deadbeef")).toBeNull();
    });

    it("returns null for a tampered payload", () => {
      const { sig } = buildRefoldResponse(validFields());
      const tampered = buildRefoldResponse(
        validFields({ tier: "all-access" }),
      ).payload;

      expect(verifySsoResponse(tampered, sig)).toBeNull();
    });

    it("defaults an unknown tier to free", () => {
      const { payload, sig } = buildRefoldResponse(
        validFields({ tier: "platinum" }),
      );

      expect(verifySsoResponse(payload, sig)?.tier).toBe("free");
    });

    it("returns null for a non-numeric external_id", () => {
      const { payload, sig } = buildRefoldResponse(
        validFields({ external_id: "not-a-number" }),
      );

      expect(verifySsoResponse(payload, sig)).toBeNull();
    });

    it("returns null for an invalid paid flag", () => {
      const { payload, sig } = buildRefoldResponse(
        validFields({ paid: "yes" }),
      );

      expect(verifySsoResponse(payload, sig)).toBeNull();
    });

    it("returns null when required fields are missing", () => {
      const { payload, sig } = buildRefoldResponse({
        nonce: "abc123",
        external_id: "42",
      });

      expect(verifySsoResponse(payload, sig)).toBeNull();
    });

    it("returns null when the SSO secret is missing", () => {
      const { payload, sig } = buildRefoldResponse(validFields());
      vi.stubEnv("OMNIDICT_SSO_SECRET", "");

      expect(verifySsoResponse(payload, sig)).toBeNull();
    });
  });
});
