# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Omnidict** is an AI-powered dictionary web application for language learners. It provides context-aware definitions, AI-generated entries, example sentences, and Anki flashcard integration for multi-language learning.

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19, TypeScript 5, Turbopack)
- **Styling:** Tailwind CSS 3 with dark mode, Radix UI primitives
- **State Management:** Zustand 5 (persisted stores)
- **Database:** Turso (libSQL, cloud SQLite) with local SQLite fallback via better-sqlite3
- **AI Providers:** DeepSeek, OpenAI, Anthropic Claude, Google Gemini
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
      ai/                   # AI model endpoints (models, test)
      anki/                 # Anki proxy
      dictionary/           # Dictionary data + pagination
      entries/              # CRUD: create, delete, get, search, regenerate, maintenance
      languages/            # Language management + validation
      lemma/                # Lemmatization
      media/                # Media generation (images, TTS audio) + key status
    page.tsx                # Main application page
    layout.tsx              # Root layout
  components/
    anki/                   # Anki integration UI
    settings/               # Settings panels (AIModelSettings, LanguageManagement)
    ui/                     # Shadcn-style base components (button, card, input)
    ContextSearch.tsx        # Context-aware search
    PaginationGrid.tsx       # Dictionary browsing grid
    SettingsModal.tsx        # Main settings modal
  hooks/
    dictionary/useDictionary.ts  # Core dictionary hook
    useAnkiExport.ts             # Anki export
    useAnkiAutoConnect.ts        # Anki auto-connection
  lib/
    ai/
      index.ts              # AIManager (coordinator)
      providers/             # Provider implementations (DeepSeek, ChatGPT, Claude, Gemini)
    database/
      core.ts               # DatabaseCore (dual-mode Turso/local)
      index.ts               # DatabaseManager facade
      repositories/          # EntryRepository, SearchRepository, CacheRepository
    anki/                   # AnkiConnect client
    media/                  # Media provider clients (Google TTS, ElevenLabs, Replicate) + styles + cache
    security/               # Rate limiting middleware + input validation
    services/DictionaryService.ts  # Business logic layer
    services/MediaService.ts       # Media generation orchestration
    types.ts                # Shared TypeScript types
  stores/                   # Zustand stores (ai, anki, apiQueue, dictionary, language, settings)
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

Optional:

- `OPENAI_API_KEY` - ChatGPT provider
- `ANTHROPIC_API_KEY` - Claude provider
- `GOOGLE_GENERATIVE_AI_KEY` - Gemini provider
- `DATABASE_PATH` - Local SQLite path (default: `./data/dictionary.db`)
- `USE_LOCAL_DB=true` - Switch to local SQLite instead of Turso
- `GOOGLE_TTS_API_KEY` - Google Cloud TTS (word audio for Anki cards)
- `ELEVENLABS_API_KEY` - ElevenLabs fallback key (users normally supply their own in Settings → Media Generation)
- `REPLICATE_API_TOKEN` - Replicate fallback key (users normally supply their own in Settings → Media Generation)
- `MEDIA_CACHE_DIR` - Generated media cache (default: `./data/media`)

## Database Schema

4 tables: `entries`, `meanings` (FK to entries), `examples` (FK to meanings), `lemma_cache` (24h TTL). Entries have a composite unique constraint on headword + source/target language + context. Local SQLite uses WAL mode.

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
- Anki integration has dual mode: localhost proxy (`/api/anki`) vs direct connection
- Request queue store handles non-blocking API calls with UI feedback

## AI Workflow System

The orchestrator + specialist workflow system lives in `ai-workflow/v2/`:

- `/rf-next` to start or resume work
- `/rf-investigate`, `/rf-plan`, `/rf-code`, etc. for manual specialist dispatch
- Runtime state in `.ai/`
- See `ai-workflow/v2/library.md` for available building blocks
