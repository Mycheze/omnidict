import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  WordSchema,
  LanguageSchema,
  ContextSchema,
  EntryRequestSchema,
  SearchRequestSchema,
  validateEntryRequest,
  validateSearchRequest,
  sanitizeError,
  checkRateLimit,
  validateOrigin,
} from './validation';

describe('WordSchema', () => {
  it('accepts valid single word', () => {
    expect(WordSchema.parse('hello')).toBe('hello');
  });

  it('accepts Unicode words', () => {
    expect(WordSchema.parse('příště')).toBe('příště');
    expect(WordSchema.parse('食べる')).toBe('食べる');
    expect(WordSchema.parse('Straße')).toBe('Straße');
  });

  it('trims whitespace', () => {
    expect(WordSchema.parse('  hello  ')).toBe('hello');
  });

  it('rejects empty string', () => {
    expect(() => WordSchema.parse('')).toThrow();
  });

  it('rejects string over 200 characters', () => {
    expect(() => WordSchema.parse('a'.repeat(201))).toThrow();
  });

  it('accepts 200 characters exactly', () => {
    const word = 'a'.repeat(200);
    expect(WordSchema.parse(word)).toBe(word);
  });

  it('accepts words with hyphens and apostrophes', () => {
    expect(WordSchema.parse("it's")).toBe("it's");
    expect(WordSchema.parse('well-known')).toBe('well-known');
  });

  it('accepts words with numbers', () => {
    expect(WordSchema.parse('B2B')).toBe('B2B');
  });
});

describe('LanguageSchema', () => {
  it('accepts valid language names', () => {
    expect(LanguageSchema.parse('English')).toBe('English');
    expect(LanguageSchema.parse('Czech')).toBe('Czech');
  });

  it('accepts hyphenated language names', () => {
    expect(LanguageSchema.parse('Serbo-Croatian')).toBe('Serbo-Croatian');
  });

  it('accepts Unicode language names', () => {
    expect(LanguageSchema.parse('Español')).toBe('Español');
  });

  it('rejects single character', () => {
    expect(() => LanguageSchema.parse('E')).toThrow();
  });

  it('rejects names over 50 characters', () => {
    expect(() => LanguageSchema.parse('A'.repeat(51))).toThrow();
  });

  it('rejects names with numbers', () => {
    expect(() => LanguageSchema.parse('Language1')).toThrow();
  });

  it('trims whitespace', () => {
    expect(LanguageSchema.parse('  English  ')).toBe('English');
  });
});

describe('ContextSchema', () => {
  it('accepts undefined (optional)', () => {
    expect(ContextSchema.parse(undefined)).toBeUndefined();
  });

  it('accepts valid context sentence', () => {
    expect(ContextSchema.parse('The cat sat on the mat.')).toBe('The cat sat on the mat.');
  });

  it('rejects string over 1000 characters', () => {
    expect(() => ContextSchema.parse('x'.repeat(1001))).toThrow();
  });

  it('trims whitespace', () => {
    expect(ContextSchema.parse('  context  ')).toBe('context');
  });
});

describe('EntryRequestSchema', () => {
  it('validates complete request', () => {
    const result = EntryRequestSchema.parse({
      word: 'hello',
      sourceLanguage: 'English',
      targetLanguage: 'Czech',
    });
    expect(result.word).toBe('hello');
    expect(result.sourceLanguage).toBe('English');
    expect(result.targetLanguage).toBe('Czech');
    expect(result.contextSentence).toBeUndefined();
  });

  it('validates request with optional AI config', () => {
    const result = EntryRequestSchema.parse({
      word: 'hello',
      sourceLanguage: 'English',
      targetLanguage: 'Czech',
      providerType: 'deepseek',
      model: 'deepseek-chat',
    });
    expect(result.providerType).toBe('deepseek');
    expect(result.model).toBe('deepseek-chat');
  });

  it('rejects missing required fields', () => {
    expect(() => EntryRequestSchema.parse({})).toThrow();
    expect(() => EntryRequestSchema.parse({ word: 'hello' })).toThrow();
  });

  it('validates with context sentence', () => {
    const result = EntryRequestSchema.parse({
      word: 'run',
      sourceLanguage: 'English',
      targetLanguage: 'Czech',
      contextSentence: 'The program will run overnight.',
    });
    expect(result.contextSentence).toBe('The program will run overnight.');
  });
});

describe('SearchRequestSchema', () => {
  it('applies defaults for page and pageSize', () => {
    const result = SearchRequestSchema.parse({ filters: {} });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('rejects page out of range', () => {
    expect(() => SearchRequestSchema.parse({ filters: {}, page: 0 })).toThrow();
    expect(() => SearchRequestSchema.parse({ filters: {}, page: 101 })).toThrow();
  });

  it('rejects pageSize out of range', () => {
    expect(() => SearchRequestSchema.parse({ filters: {}, pageSize: 0 })).toThrow();
    expect(() => SearchRequestSchema.parse({ filters: {}, pageSize: 2001 })).toThrow();
  });

  it('rejects search term over 100 characters', () => {
    expect(() => SearchRequestSchema.parse({
      filters: { searchTerm: 'a'.repeat(101) },
    })).toThrow();
  });
});

describe('sanitizeError', () => {
  it('extracts message from ZodError', () => {
    const error = new z.ZodError([{
      code: 'too_small',
      minimum: 1,
      type: 'string',
      inclusive: true,
      exact: false,
      message: 'Word is required',
      path: ['word'],
    }]);
    expect(sanitizeError(error)).toBe('Word is required');
  });

  it('redacts API keys from error messages', () => {
    const error = new Error('Failed with api_key: sk-abc123xyz');
    const sanitized = sanitizeError(error);
    expect(sanitized).not.toContain('sk-abc123xyz');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('redacts tokens from error messages', () => {
    const error = new Error('Invalid token: mySecretToken123');
    expect(sanitizeError(error)).not.toContain('mySecretToken123');
  });

  it('redacts passwords from error messages', () => {
    const error = new Error('password: supersecret failed');
    expect(sanitizeError(error)).not.toContain('supersecret');
  });

  it('truncates messages over 200 characters', () => {
    const error = new Error('x'.repeat(201));
    expect(sanitizeError(error)).toBe('Internal server error');
  });

  it('returns generic message for non-Error objects', () => {
    expect(sanitizeError('string error')).toBe('Unknown error occurred');
    expect(sanitizeError(42)).toBe('Unknown error occurred');
    expect(sanitizeError(null)).toBe('Unknown error occurred');
  });
});

describe('checkRateLimit', () => {
  it('allows first request', () => {
    expect(checkRateLimit('test-first-request', 5, 60000)).toBe(true);
  });

  it('allows requests under the limit', () => {
    const id = 'test-under-limit';
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(id, 5, 60000)).toBe(true);
    }
  });

  it('blocks requests over the limit', () => {
    const id = 'test-over-limit';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(id, 10, 60000);
    }
    expect(checkRateLimit(id, 10, 60000)).toBe(false);
  });

  it('resets after window expires', async () => {
    const id = 'test-window-reset';
    // Use a 50ms window
    for (let i = 0; i < 3; i++) {
      checkRateLimit(id, 3, 50);
    }
    // Should be blocked now
    expect(checkRateLimit(id, 3, 50)).toBe(false);
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    // Should be allowed again
    expect(checkRateLimit(id, 3, 50)).toBe(true);
  });
});

describe('validateOrigin', () => {
  function makeRequest(origin: string | null, host: string | null): Request {
    const headers = new Headers();
    if (origin) headers.set('origin', origin);
    if (host) headers.set('host', host);
    return new Request('http://localhost:3200/api/test', { headers });
  }

  it('returns false when origin is missing', () => {
    expect(validateOrigin(makeRequest(null, 'localhost:3200'))).toBe(false);
  });

  it('returns false when host is missing', () => {
    expect(validateOrigin(makeRequest('http://localhost:3200', null))).toBe(false);
  });

  it('allows same-origin http request', () => {
    expect(validateOrigin(makeRequest('http://localhost:3200', 'localhost:3200'))).toBe(true);
  });

  it('allows same-origin https request', () => {
    expect(validateOrigin(makeRequest('https://example.com', 'example.com'))).toBe(true);
  });

  it('allows localhost:3200 explicitly', () => {
    expect(validateOrigin(makeRequest('http://localhost:3200', 'some-other-host'))).toBe(true);
  });

  it('allows 127.0.0.1:3200 explicitly', () => {
    expect(validateOrigin(makeRequest('http://127.0.0.1:3200', 'some-other-host'))).toBe(true);
  });

  it('rejects cross-origin requests', () => {
    expect(validateOrigin(makeRequest('http://evil.com', 'localhost:3200'))).toBe(false);
  });
});
