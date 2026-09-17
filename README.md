**English** | [简体中文](README.zh-CN.md)

# AskTree

**Turn any article into a tree of questions you can actually explore.**

AskTree is a local-first study tool. Load a Markdown article, highlight the sentence you don't understand, and ask. The answer becomes a new page you can read — and drill into again. Every branch is a line of inquiry; the tree grows exactly as deep as your curiosity goes.

No server, no account, no analytics. Articles, answers and the tree live in your browser (IndexedDB), and you choose which LLM to use.

---

## Why

**Reading alone is passive. Asking makes it active.**
Most people scroll through an article, hit a confusing sentence, and move on. AskTree makes that moment productive: select the passage, ask *why*, and get an explanation anchored to the text you're actually reading.

**Every answer is a new starting point.**
Unlike a chat window where each question stands alone, AskTree keeps the whole learning path as a tree — you can always see where you came from and what is still open.

**Structure reflects understanding.**
Mark a page `resolved` when it clicks. The sidebar becomes a map of your own learning process.

---

## Features

**Ask against the text**
- Select any passage → click the floating button → the LLM answers it as a new child page.
- Answers are full Markdown pages themselves — select inside them to go deeper.
- **Free ask** (no selection): choose **◀ Left / Right ▶** to pick which page your question is about.

**When you don't know what to ask**
- Click **💡** for three suggested questions about the current passage.
- **↻** for a new batch, **✕** to dismiss, **?** to inspect the exact prompt used.

**See exactly what is sent**
- The **?** button next to a title opens **Prompt Debug**: the precise SYSTEM/USER text that produced that page.
- Prompt templates are editable in Settings, including the suggested-questions template.

**Reading continuity**
- Your reading position is remembered per page and restored when you come back.
- Passages you have already asked about get a subtle underline; the active selection wins.
- When a page came from a quoted selection, the left pane scrolls straight to that quote.

**Everything is portable**
- **Copy Markdown** / **Download .md** for any page.
- **Export Tree / Import Tree** the whole tree as JSON.

**Bring your own model**
- **Ollama** (local, no key), **OpenAI-compatible** (defaults to DeepSeek, thinking mode requested automatically), or **Anthropic-compatible**.
- Actionable errors (auth, rate limit, network, malformed response) with safe retries.

**Math-aware**
- Inline and display LaTeX via KaTeX.
- Formulas can be selected and asked about like any other text.

---

## Quick start (local)

Requirements: **Node 18+** and **pnpm**.

```bash
git clone git@github.com:petersonwhj/askTree.git
cd askTree
pnpm install
pnpm dev
```

Open **http://localhost:5173/askTree/** — note the `/askTree/` base path.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server (Vite) |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm test:watch` | Re-run tests on change |
| `pnpm lint` | Type-check core + web |
| `pnpm build` | Build `@asktree/core` and the web app |
| `pnpm deploy` | Build and publish to GitHub Pages |

---

## Configure your LLM

Open **Settings** in the header:

| Provider | Default endpoint | Default model | Key |
| --- | --- | --- | --- |
| 🖥️ Ollama | `http://localhost:11434` | `llama3` | not needed |
| ☁️ OpenAI Compatible API | `https://api.deepseek.com` | `deepseek-flash` | required |
| 🧠 Anthropic Compatible API | `https://api.anthropic.com` | `claude-sonnet-4-6` | required |

Switching providers is a draft — nothing is written until you press **Save**; **Cancel** discards.

**CORS / gateways (dev):** if your endpoint rejects browser cross-origin requests, set `LLM_PROXY_TARGET` in `.env.local` (see `.env.local.example`). Requests prefixed with `/llm-` are proxied and browser `Origin`/`Referer` headers are stripped.

---

## How to use

1. **Start a tree** — paste Markdown and click *Start Learning*, use the 📂 button, or drag & drop a `.md` file. A sample article ships at `apps/web/public/samples/gemini-sample.md`.
2. **Ask** — select text, click the floating **Ask about "…"** button, type your question, press **Send** (Enter sends, Shift+Enter adds a line).
3. **Drill in** — the answer opens on the right as a new node; select inside it for follow-ups.
4. **Use the helpers** — 💡 for suggested questions, **?** next to a title for the exact prompt.
5. **Stay oriented** — the sidebar shows the tree, the breadcrumb shows the path, `→` shifts a node so you can read it against its parent.
6. **Track understanding** — set a page to `resolved` when you're done with it.

---

## Privacy

AskTree is pure frontend. Your articles, questions, answers and tree stay in your browser's IndexedDB. The only outbound request is the one you configure (your LLM endpoint). No server, no account, no analytics.

---

## Architecture

```
askTree/
├── packages/core/   # @asktree/core — zero-dependency TypeScript logic
│   └── src/         #   TreeStore, LLMService, prompt building, storage adapter
├── apps/web/        # @asktree/web — Vite + React app
│   └── src/         #   UI components, IndexedDB adapter, Markdown rendering
└── tests/           # Vitest suites (core + web)
```

| Layer | Technology |
| --- | --- |
| Language | TypeScript (strict) |
| Bundler | tsup (core) · Vite (web) |
| UI | React 18 |
| Markdown / math | markdown-it + KaTeX (DOMPurify sanitized) |
| Storage | IndexedDB |
| LLM | Ollama · OpenAI-compatible · Anthropic-compatible |
| Tests | Vitest + Testing Library |

---

## Deploy

```bash
pnpm deploy
```

Builds the app and publishes `apps/web/dist` to the `gh-pages` branch. The app is built with base `/askTree/`, so it serves from `https://<user>.github.io/askTree/`.

---

## Roadmap

- [x] **Web** — pure-frontend app, GitHub Pages deployment
- [ ] **VS Code** — extension reusing `@asktree/core`
- [ ] **Chrome** — browser clipping extension
- [ ] **Imports** — DOCX / PDF with visible warnings

---

## License

MIT
