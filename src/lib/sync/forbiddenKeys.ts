/**
 * Credential-shaped key detection for the settings sync payload.
 *
 * Framework-free so it can be used from both the API route (defense in
 * depth on inbound payloads) and tests.
 */

const FORBIDDEN_KEY_PATTERN = /^apikeys?$/i;

/**
 * Walk an arbitrary parsed JSON value and report whether any object key is
 * named apiKey/apiKeys (any casing), at any nesting depth. Synced settings
 * must never contain credentials.
 */
export function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) return true;
      if (containsForbiddenKey(child)) return true;
    }
  }
  return false;
}
