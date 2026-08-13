import { z } from "zod";

// Zod schemas for validation
export const WordSchema = z
  .string()
  .min(1, "Word is required")
  .max(200, "Word is too long (max 200 characters)") // Increased from 100 to allow contextual hints
  .regex(/^[\p{L}\p{N}\p{P}\p{S}\s]+$/u, "Word contains invalid characters")
  .transform((str) => str.trim());

export const LanguageSchema = z
  .string()
  .min(2, "Language name too short")
  .max(50, "Language name too long")
  .regex(/^[\p{L}\s\-]+$/u, "Language name contains invalid characters")
  .transform((str) => str.trim());

export const ContextSchema = z
  .string()
  .max(1000, "Context sentence too long")
  .optional()
  .transform((str) => str?.trim());

export const EntryRequestSchema = z.object({
  word: WordSchema,
  sourceLanguage: LanguageSchema,
  targetLanguage: LanguageSchema,
  contextSentence: ContextSchema,
  // AI configuration (optional)
  providerType: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const SearchRequestSchema = z.object({
  filters: z.object({
    searchTerm: z.string().max(100).optional(),
    sourceLanguage: LanguageSchema.optional(),
    targetLanguage: LanguageSchema.optional(),
  }),
  page: z.number().int().min(1).max(100).default(1),
  pageSize: z.number().int().min(1).max(2000).default(50), // FIXED: Increased from 200 to 2000 for remote DB optimization
});

export const LanguageValidationSchema = z.object({
  inputLanguage: LanguageSchema,
});

// Validation functions
export function validateEntryRequest(data: unknown) {
  return EntryRequestSchema.parse(data);
}

export function validateSearchRequest(data: unknown) {
  return SearchRequestSchema.parse(data);
}

export function validateLanguageRequest(data: unknown) {
  return LanguageValidationSchema.parse(data);
}

// Strip key/token/password-shaped substrings from arbitrary text.
// Used for both client-facing errors and server logs.
export function redactSensitive(text: string): string {
  return text
    .replace(/api[_-]?key[s]?[:\s]*[a-zA-Z0-9-_]+/gi, "[REDACTED]")
    .replace(/token[s]?[:\s]*[a-zA-Z0-9-_]+/gi, "[REDACTED]")
    .replace(/password[s]?[:\s]*\S+/gi, "[REDACTED]");
}

// Error sanitization for client-facing responses (redacts AND truncates)
export function sanitizeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.errors[0]?.message || "Validation error";
  }

  if (error instanceof Error) {
    let message = redactSensitive(error.message);

    // Truncate very long error messages
    if (message.length > 200) {
      message = "Internal server error";
    }

    return message;
  }

  return "Unknown error occurred";
}

// Rate limiting (per-instance in-memory store)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

// Periodically evict expired windows so the map can't grow unbounded on a
// long-running server. Piggybacks on request traffic; no timer needed.
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;
let nextEvictionAt = 0;

function evictExpiredLimits(now: number): void {
  if (now < nextEvictionAt) return;
  nextEvictionAt = now + EVICTION_INTERVAL_MS;
  for (const [key, limit] of rateLimits) {
    if (now > limit.resetTime) {
      rateLimits.delete(key);
    }
  }
}

export function checkRateLimit(
  identifier: string,
  maxRequests = 100,
  windowMs = 60000,
): boolean {
  const now = Date.now();
  evictExpiredLimits(now);
  const limit = rateLimits.get(identifier);

  if (!limit || now > limit.resetTime) {
    rateLimits.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (limit.count >= maxRequests) {
    return false;
  }

  limit.count++;
  return true;
}

// CSRF protection helper
export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  // Same-origin requests (Origin matches the Host the request arrived on)
  const allowedOrigins = [`http://${host}`, `https://${host}`];

  // The canonical public URL, when configured (covers proxies/CDNs where
  // Host may differ from the public origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    allowedOrigins.push(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Localhost is acceptable only outside production
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:3200", "http://127.0.0.1:3200");
  }

  return allowedOrigins.includes(origin);
}
