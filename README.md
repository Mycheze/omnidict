# Deep Dict

An AI-powered dictionary application for language learners with context-aware definitions, example sentences, and Anki integration.

## Features

- **Context-Aware Search**: Double-click words in sentences to get definitions that understand context
- **AI-Generated Entries**: Powered by DeepSeek AI for accurate definitions and examples
- **Anki Integration**: Export entries directly to your Anki decks
- **Multi-Language Support**: Customizable language pairs for learning
- **Offline-First**: SQLite database for fast, reliable access

## Getting Started

### Prerequisites

- Node.js 18+ 
- A DeepSeek API key

### Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your API key to `.env.local`:
   ```
   DEEPSEEK_API_KEY=your_api_key_here
   ```

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
- **Database**: SQLite with better-sqlite3
- **AI**: DeepSeek API (OpenAI-compatible)
- **State Management**: Zustand
- **UI Components**: Shadcn/ui + Lucide icons

## Contributing

This is an open-source project. Feel free to submit issues and pull requests!

## License

MIT License - see LICENSE file for details

## Development Notes

- Database is automatically created on first run
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
