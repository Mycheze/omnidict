# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Omnidict** is an AI-powered dictionary web application for language learners. It provides context-aware definitions, AI-generated entries, example sentences, and Anki flashcard integration for multi-language learning.

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19, TypeScript 5, Turbopack)
- **Styling:** Tailwind CSS 3 with dark mode, Radix UI primitives
- **State Management:** Zustand 5 (persisted stores)
- **Database:** Turso (libSQL, cloud SQLite) with local SQLite fallback via better-sqlite3
- **AI Providers:** DeepSeek (default), OpenAI, Anthropic Claude, Google Gemini (`@google/genai`), OpenRouter (price hedge — many hosted models via one key)
- **Auth:** Refold-platform SSO (HMAC handshake against refold.la) + jose-signed session cookie; anonymous use fully supported
- **Validation:** Zod + React Hook Form
- **Testing:** Vitest with V8 coverage
- **Icons:** Lucide React

## Commands

```bash
npm run dev          # Dev server on port 3200 (Turso DB, Turbopack)
npm run dev:local    # Dev server with local SQLite
npm run build        # Production build (also type-checks)
npm start            # Production server (port 3200)
npm run lint         # ESLint
npm test             # Vitest test suite
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with V8 coverage
```

Dev server runs on **port 3200**, not the default 3000.

## Project Structure

```
src/
  app/
    api/                    # Next.js API routes
      ai/test/              # Provider connection test (same code path as production calls)
      anki/                 # Anki proxy (dev only)
      anki-queue/           # Pending-card queue: list/enqueue + claim, complete, import
      auth/                 # Refold SSO: login, callback, logout, me
      dictionary/           # Pagination index
      entries/              # CRUD: create, delete, get, search, regenerate
      languages/            # Language management + validation
      media/                # Media generation (images, TTS audio) + key status
      user/                 # Per-user settings sync + media usage
    page.tsx                # Main application page
    layout.tsx              # Root layout (mounts AuthProvider)
  components/
    anki/                   # Anki integration UI (incl. AnkiQueueStatus widget)
    auth/                   # AuthProvider context + AccountBadge
    settings/               # Settings panels (AIModelSettings, MediaSettings, LanguageManagement)
    ui/                     # Shadcn-style base components (button, card, input)
    ContextSearch.tsx        # Context-aware search
    PaginationGrid.tsx       # Dictionary browsing grid
    SettingsModal.tsx        # Main settings modal
  hooks/
    dictionary/useDictionary.ts  # Core dictionary hook
    useAnkiExport.ts             # Anki export (thin wrapper over lib/anki)
    useAnkiConnectivity.ts       # Permanent connectivity watcher (reachable flag, flush trigger)
    useAnkiQueueMigration.ts     # Imports anonymous local queue on login
    useAuth.ts                   # Auth context accessor
    useSettingsSync.ts           # Server-side settings sync (mounted in AuthProvider)
  lib/
    ai/
      index.ts              # AIManager (coordinator)
      providers/metadata.ts  # SINGLE SOURCE OF TRUTH: provider union, model lists, defaults, reasoning flags
      providers/             # DeepSeek, ChatGPT, Claude, Gemini, OpenRouter (BaseProvider has unified testConnection)
    auth/                   # sso.ts (HMAC), session.ts (jose JWT cookie), entitlements.ts (Refold re-check)
    database/
      core.ts               # DatabaseCore (dual-mode Turso/local)
      index.ts               # DatabaseManager facade
      repositories/          # Entry, Search, Cache, User, AnkiQueue repositories
    anki/                   # AnkiConnect client, exportCard (pure), writeQueue, queueFlusher
    media/                  # Media provider clients (Google TTS, ElevenLabs, Replicate) + styles + cache
    security/               # Rate limiting middleware + input validation
    services/DictionaryService.ts  # Business logic layer
    services/MediaService.ts       # Media generation (explicit useServerKeys; quota helpers)
    sync/                   # Settings-sync envelope (allowlist collect/apply; secrets never sync)
    types.ts                # Shared TypeScript types
  stores/                   # Zustand stores (ai, anki, ankiQueue, apiQueue, dictionary, language, settings)
data/
  dictionary.db             # Local SQLite database file
  prompts/                  # AI prompt templates
ai-workflow/                # AI workflow system (gitignored, see below)
```

## Architecture

3-tier layered architecture:

```
React Components -> Custom Hooks -> API Routes -> DictionaryService -> Database/AI Managers
```

- **AI providers** use a factory pattern with a shared `ModelProvider` interface
- **Database** uses a repository pattern with dual-mode support (Turso cloud / local SQLite)
- **API routes** are wrapped with `withSecurity()` middleware for rate limiting and validation
- **State** is managed via separate Zustand stores persisted to localStorage (SSR-safe)
- AI SDKs are server-only imports; client components only access provider metadata

## Environment Variables

Required:

- `DEEPSEEK_API_KEY` - Default AI provider
- `TURSO_DATABASE_URL` - Cloud database URL
- `TURSO_AUTH_TOKEN` - Cloud database auth

Auth/SSO (required for login features; app works anonymously without them):

- `OMNIDICT_SSO_SECRET` - Shared HMAC secret with refold-platform (SSO handshake)
- `OMNIDICT_API_SECRET` - Shared Bearer secret for the Refold entitlements endpoint
- `OMNIDICT_SESSION_SECRET` - Signs the omnidict session JWT cookie
- `REFOLD_BASE_URL` - `https://refold.la` (dev: `http://localhost:3000`)
- `NEXT_PUBLIC_APP_URL` - `https://dict.refold.la` (dev: `http://localhost:3200`)

Optional:

- `OPENROUTER_API_KEY` - OpenRouter server fallback key (price-hedge provider)
- `DATABASE_PATH` - Local SQLite path (default: `./data/dictionary.db`)
- `USE_LOCAL_DB=true` - Switch to local SQLite instead of Turso
- `GOOGLE_TTS_API_KEY` - Google Cloud TTS (word audio; free for all users)
- `ELEVENLABS_API_KEY` - Server key for PAID users' sentence audio (free users supply their own)
- `REPLICATE_API_TOKEN` - Server key for PAID users' images (free users supply their own)
- `MEDIA_QUOTA_IMAGES_PER_MONTH` / `MEDIA_QUOTA_TTS_PER_MONTH` - Paid-tier quotas (default 300/600)
- `MEDIA_CACHE_DIR` - Generated media cache (default: `./data/media`)

## Database Schema

8 tables: `entries`, `meanings` (FK to entries), `examples` (FK to meanings), `lemma_cache` (24h TTL), `users` (keyed by Refold user id), `user_settings` (JSON blob), `media_usage` (per-user monthly quota counters), `pending_anki_cards` (delayed card queue with claim semantics). Entries have a composite unique index on headword + source/target language + context; entries remain global/communal (no per-user ownership). Local SQLite uses WAL mode. No migration system — new tables go in `createTables()` + `VALID_TABLE_NAMES` in `core.ts`.

## Auth & Paid Tier

- Login = redirect handshake with refold.la (`/api/auth/login` → Refold `/api/omnidict/sso` → `/api/auth/callback`); identity is the stable Refold user id. Session = 30-day jose JWT cookie carrying `tier`/`paid` claims, re-checked against Refold's entitlements endpoint (24h in `/api/auth/me`, 1h before server-key media spending — fail closed).
- Paid users get media generation on server env keys with monthly quotas; anonymous/free users must supply their own ElevenLabs/Replicate keys. User-supplied API keys are NEVER stored server-side or synced.
- Settings sync: allowlist envelope (`src/lib/sync/settingsSync.ts`), server-wins on login, first login seeds from local, debounced push after.

## Key Conventions

### TypeScript

- Avoid `as` type assertions — use type guards or fix underlying types
- Use discriminated unions with explicit `type` fields over type guards
- Prefer `switch` statements over `if/else` chains (explicit default case)

### React/Next.js

- Favor React Server Components where possible
- Use `@/*` path alias for imports (maps to `src/*`)
- Components are organized by feature area under `src/components/`

## Key Patterns

- All POST API routes use Zod schema validation
- Rate limits vary by route (50/min for creates, 200/min for search)
- Anki integration has dual mode: localhost proxy (`/api/anki`, dev only) vs direct browser connection (requires the site origin in AnkiConnect's `webCorsOriginList`)
- Delayed card creation: when Anki is unreachable, exports queue (server-backed `pending_anki_cards` when logged in, persisted local store otherwise) and auto-flush via `queueFlusher` when `useAnkiConnectivity` detects Anki; queued cards store raw `ExportContext` and resolve deck/fields/media at flush time
- Request queue store handles non-blocking API calls with UI feedback
- Model names live ONLY in `src/lib/ai/providers/metadata.ts` — never hardcode them elsewhere; flush `lemma_cache` after changing models

## AI Workflow System

The orchestrator + specialist workflow system lives in `ai-workflow/v2/`:

- `/rf-next` to start or resume work
- `/rf-investigate`, `/rf-plan`, `/rf-code`, etc. for manual specialist dispatch
- Runtime state in `.ai/`
- See `ai-workflow/v2/library.md` for available building blocks
