# AskTree — Tree-Structured Learning Tool

AskTree is an open-source, pure-frontend tool for learning through tree-structured Q&A. Load a Markdown article, select text, ask questions, and let an LLM guide you deeper — each answer becoming a new branch in your knowledge tree.

## Concept

1. **Root node** — your initial article (paste, load a `.md` file, or drag & drop)
2. **Edge** — select text in a node + ask a question
3. **Child node** — the LLM's answer, itself a Markdown article
4. **Recursive** — select text in answers to ask follow-up questions, growing the tree
5. **Terminal** — mark a node as _resolved_ when you fully understand it

## Features

- Pure frontend — no server, no data leaving your machine
- Supports OpenAI-compatible APIs and Ollama (local LLMs)
- Markdown rendering with LaTeX math formulas (KaTeX)
- Load `.md` files via button or drag & drop
- Tree sidebar + breadcrumb navigation
- Per-node status tracking (`resolved` / `question`)
- Export/import your learning tree as JSON
- All data stored in IndexedDB (browser-local)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm test

# Production build
pnpm build
```

### Configure LLM

1. Launch the app (`pnpm dev`)
2. Click **Settings** in the header
3. Choose **Ollama** (local) or **OpenAI-compatible** (remote)
4. Enter your endpoint URL and API key (if required)

## Architecture

```
asktree/
├── packages/core/        # @asktree/core — zero-dependency TypeScript logic
│   └── src/              #   TreeStore, LLMService, Prompt, StorageAdapter
├── apps/web/             # @asktree/web — Vite + React web app
│   └── src/              #   UI components, IndexedDB adapter, markdown rendering
└── tests/                # Vitest test suites (core + web)
```

### Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict) |
| Bundler (core) | tsup → ESM + CJS |
| Bundler (web) | Vite |
| UI | React 18 |
| Markdown | markdown-it + KaTeX |
| Sanitization | DOMPurify |
| Storage | IndexedDB (web) |
| LLM | Ollama native + OpenAI-compatible |
| Tests | Vitest + Testing Library |

## Roadmap

- [x] **Phase 1: Web** — GitHub Pages static deployment
- [ ] **Phase 2: VS Code** — Extension reusing `@asktree/core`
- [ ] **Phase 3: Chrome** — Browser extension

## License

MIT
