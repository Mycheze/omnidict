# Omnidict

An AI-powered dictionary application for language learners with context-aware definitions, example sentences, and Anki integration.

## Features

- **Context-Aware Search**: Double-click words in sentences to get definitions that understand context
- **AI-Generated Entries**: Powered by DeepSeek AI for accurate definitions and examples
- **Anki Integration**: Export entries directly to your Anki decks
- **Multi-Language Support**: Customizable language pairs for learning
- **Cloud Database**: Uses Turso for reliable, scalable data storage

## Getting Started

### Prerequisites

- Node.js 18+ 
- A DeepSeek API key
- A Turso database (recommended) or local SQLite for development

### Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. **For Turso (Recommended - Default)**:
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   TURSO_DATABASE_URL=libsql://your-database-url.turso.io
   TURSO_AUTH_TOKEN=your_turso_auth_token_here
   ```

3. **For Local Development (Optional)**:
   ```env
   DEEPSEEK_API_KEY=your_api_key_here
   USE_LOCAL_DB=true
   DATABASE_PATH=./data/dictionary.db
   ```

### Database Setup

#### Option 1: Turso (Recommended - Default)

1. Sign up at [turso.tech](https://turso.tech)
2. Create a new database
3. Get your database URL and auth token
4. Add them to your `.env.local` file

#### Option 2: Local SQLite (Development)

1. Set `USE_LOCAL_DB=true` in your `.env.local`
2. The local database will be created automatically

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3200](http://localhost:3200) to view the application.

### Building for Production

```bash
npm run build
npm start
```

## Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Database**: Turso (libSQL) with SQLite fallback
- **AI**: DeepSeek API (OpenAI-compatible)
- **State Management**: Zustand
- **UI Components**: Shadcn/ui + Lucide icons

## Contributing

This is an open-source project. Feel free to submit issues and pull requests!

## License

MIT License - see LICENSE file for details

## Development Notes

- **Database**: Uses Turso by default. Set `USE_LOCAL_DB=true` for local SQLite
- The app runs on port 3200 by default
- Context-aware search works by double-clicking words in the text area
- All AI prompts are stored in `data/prompts/` for easy customization

# Todo List

## Features
- [ ] AI Model changing
- [ ] Text size or font changing
- [ ] Individual settings saved (cookies) (I think this works already)
- [ ] Clipboard monitoring
- [ ] Can Anki work on the web version? Extension maybe?
- [ ] Tutorial video!
- [ ] Elevenlabs audio generation and storage
- [ ] Entry editing (for small changes)
- [ ] Human notes on entries
- [ ] Mobile optimization (UI)
- [ ] Dialect configuration
- [ ] Phrase adding
- [ ] Admin mode to purge parts of the database (remove a language entierly)
- [ ] Dark mode

## Bugs
- [ ] Recents show non-matching language pairs
- [ ] Part of speech is always in English
- [ ] Clicking on an entry clears the filter (it should stay and have a little x to clear)
- [ ] Duplicate entry adding (I don't think it generates new entries, but it doubles up in the list)
- [ ] Asian languages often don't get translations
- [ ] Searching the word in a non-English native language causes problems
- [ ] Unintuitive naming "From" and "To" should be Base and Target language
- [ ] List of added languages is super messy (and non standardized)
- [ ] Opening an old entry isn't instant
- [ ] Typing lag
- [ ] DB loading lag
- [ ] Context aware search is a centered weird in it's box
- [ ] Errors (need to monitor that)
- [ ] On mobile, adding a language adds in reverse?
- [ ] Language verification is broken


# Instructions
