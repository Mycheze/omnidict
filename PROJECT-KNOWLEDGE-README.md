# Project Knowledge Buffer

This folder contains a flattened copy of all relevant project files for Claude context.

## What Gets Included

### ✅ Configuration Files
- `package.json` - Dependencies and scripts
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Styling configuration
- `postcss.config.js` - CSS processing
- `tsconfig.json` - TypeScript configuration
- `.env.example` - Environment variables template
- `.gitignore` - Git ignore patterns
- `README.md` - Project documentation

### ✅ Source Code (Flattened)
All `.ts` and `.tsx` files from:
- `src/app/` → `app__*.tsx` (pages and API routes)
- `src/components/` → `components__*.tsx` (UI components)
- `src/hooks/` → `hooks__*.ts` (React hooks)
- `src/lib/` → `lib__*.ts` (utilities, database, AI)
- `src/stores/` → `stores__*.ts` (state management)
- `src/app/globals.css` → `app__globals.css` (styles)

### ✅ AI Prompts
- `data/prompts/*.txt` → `data__prompts__*.txt` (AI prompt templates)

## What Gets Excluded

### ❌ Sensitive Files
- `.env.local` (contains API keys)
- Any files with credentials or secrets

### ❌ Generated/Build Files
- `node_modules/` (dependencies)
- `.next/` (build output)
- `*.log` files
- `package-lock.json` (auto-generated)

### ❌ Binary/Large Files
- `data/dictionary.db` (SQLite database)
- Image files in `public/`
- Font files

### ❌ Version Control
- `.git/` folder and history

## Usage

1. **Sync files:** Run `./sync_project_knowledge.sh`
2. **Upload to Claude:** Select all files in `project_knowledge/` and drag to Claude
3. **Update:** Re-run script whenever you make significant changes

## File Naming Convention

Original nested paths become flat filenames:
- `src/app/page.tsx` → `app__page.tsx`
- `src/lib/database/index.ts` → `lib__database__index.ts`
- `data/prompts/prompt.txt` → `data__prompts__prompt.txt`

This keeps files organized while making them easy to upload in bulk.
