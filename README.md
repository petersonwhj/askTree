# AskTree — Tree-Structured Learning Tool

AskTree is an open-source, pure-frontend tool for learning through tree-structured Q&A. Load a Markdown article, select text, ask questions, and let an LLM guide you deeper — each answer becoming a new branch in your knowledge tree.

## Philosophy

**Reading alone is passive. Asking questions makes it active.**

Most people read articles linearly: scroll, skim, move on. Real understanding comes from interrogating the text — pausing at a confusing sentence, asking _why_, and getting an explanation that connects the dots. AskTree turns every article into a conversation.

**Every answer is a new starting point.**

Unlike chat-based AI tools where each question stands alone, AskTree organizes your learning as a **tree**. You start with the root article. You select a passage, ask about it, and the LLM's answer becomes a child node — itself a full Markdown article. You can then select text _within that answer_ and ask a follow-up question. The tree grows exactly as deep as your curiosity takes you.

**Structure reflects understanding.**

Each branch is a line of inquiry. Each node has a status: _question_ (still exploring) or _resolved_ (fully understood). The sidebar gives you a map of your own learning process — where you've been, what's still open, how deep you've gone.

**Your data stays yours.**

Everything runs in your browser. Articles, questions, answers, and the tree structure are stored locally in IndexedDB. No server, no account, no analytics. You choose which LLM to use — local (Ollama), API-based (OpenAI-compatible, Anthropic), or your own enterprise gateway.

AskTree doesn't just answer your questions. It turns learning into a structured, explorable artifact that grows with you.

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
