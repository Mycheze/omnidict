# CLAUDE.md - Project Context for AI Assistants

## Project Overview

**Omnidict** is an AI-powered dictionary web application for language learners. It provides context-aware definitions, AI-generated entries, example sentences, and Anki flashcard integration for multi-language learning.

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19, TypeScript 5)
- **Styling:** Tailwind CSS 3 with dark mode, Radix UI primitives
- **State Management:** Zustand 5 (persisted stores)
- **Database:** Turso (libSQL, cloud SQLite) with local SQLite fallback via better-sqlite3
- **AI Providers:** DeepSeek, OpenAI, Anthropic Claude, Google Gemini
- **Validation:** Zod + React Hook Form
- **Icons:** Lucide React

## Commands

```bash
npm run dev          # Dev server on port 3200 (Turso DB, Turbopack)
npm run dev:local    # Dev server with local SQLite
npm run build        # Production build
npm start            # Production server
npm run lint         # ESLint
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
      index.ts              # DatabaseManager facade
      repositories/          # EntryRepository, SearchRepository, CacheRepository
    anki/                   # AnkiConnect client
    security/               # Rate limiting middleware + input validation
    services/DictionaryService.ts  # Business logic layer
    types.ts                # Shared TypeScript types
  stores/                   # Zustand stores (ai, anki, apiQueue, dictionary, language, settings)
data/
  dictionary.db             # Local SQLite database file
  prompts/                  # AI prompt templates
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

## Database Schema

4 tables: `entries`, `meanings` (FK to entries), `examples` (FK to meanings), `lemma_cache` (24h TTL). Entries have a composite unique constraint on headword + source/target language + context. Local SQLite uses WAL mode.

## Key Patterns

- Path alias: `@/*` maps to `./src/*`
- All POST API routes use Zod schema validation
- Rate limits vary by route (50/min for creates, 200/min for search)
- Anki integration has dual mode: localhost proxy (`/api/anki`) vs direct connection
- Request queue store handles non-blocking API calls with UI feedback

## Current Branch: `model-selection`

Active work on AI model selection feature - adding provider/model switching UI and API endpoints.

## No Test Framework

No automated testing setup (Jest, Vitest, etc.) is currently configured. Validation relies on TypeScript strict mode, Zod runtime checks, and manual testing.
