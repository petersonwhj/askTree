# AskTree — Design Specification

> Date: 2026-05-26
> Status: Approved

## Overview

**AskTree** is an open-source, pure-frontend tool for tree-structured learning with LLMs. Users paste or load a Markdown article, select unfamiliar terms, and ask an LLM to explain them. Each explanation can itself contain unfamiliar terms — the user selects and asks again, recursively building a tree of knowledge exploration from a root article.

### Why

Existing LLM chat interfaces mix questions and answers linearly, making it hard to track the provenance of each follow-up. AskTree models the learning process as a **tree**: each article (root or LLM answer) is a node, each selected-term + question is an **edge** to a child answer node. Recursion terminates when the user fully understands an answer.

---

## Release Roadmap

1. **Phase 1: Web App** — GitHub Pages static deploy, zero setup
2. **Phase 2: VS Code Extension** — reuse @asktree/core
3. **Phase 3: Chrome Extension** — reuse @asktree/core

---

## Architecture

### Layer Model

```
┌────────────────────────────────────────┐
│  UI Layer (React)                      │
│  apps/web  apps/vscode  apps/chrome    │
├────────────────────────────────────────┤
│  @asktree/core (TypeScript, zero deps) │
│  TreeStore / LLMService / Prompt       │
├────────────────────────────────────────┤
│  StorageAdapter (interface)            │
│  IndexedDB | WorkspaceFS | ChromeStore │
├────────────────────────────────────────┤
│  Platform APIs: fetch, crypto, storage │
└────────────────────────────────────────┘
```

- **Pure frontend** — no backend/server. LLM calls from browser directly to user's configured endpoint.
- **@asktree/core** — zero runtime dependencies, uses only platform Web APIs (fetch, crypto).
- **Three platform adapters** share the same core and React component library.
- **State management** — React Context for TreeStore, local useState for UI ephemerals. No Redux.

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Core | TypeScript (tsup) | Outputs ESM + CJS |
| UI | React | Shared across platforms |
| Web build | Vite | SPA with HMR |
| Monorepo | pnpm workspace | packages/core + apps/* |
| Testing | vitest | Unit + component |
| Storage (Web) | IndexedDB | key-value per file |
| Storage (VS Code) | Workspace FS | `.asktree/` directory |
| Storage (Chrome) | IndexedDB | Same as Web |

---

## Data Model

### Types

```typescript
interface Node {
  id: string;                    // UUID
  title: string;                 // Display title
  type: "article" | "answer";    // Source article vs LLM response
  status: "resolved" | "question";
  parentId: string | null;
  children: Edge[];
  createdAt: number;             // timestamp
  // content NOT stored here — separate .md file
}

interface Edge {
  id: string;                    // UUID
  sourceNodeId: string;
  targetNodeId: string;
  selectedText: string;          // Empty = free-form question
  startPos: number;
  endPos: number;
  question: string;              // User's question text
}

interface TreeJSON {
  version: number;
  rootNodeId: string;
  nodes: Record<string, Node>;   // keyed by id
  createdAt: number;
  updatedAt: number;
}
```

### Storage Separation

- **`tree.json`** — metadata (nodes + edges). Small, always in memory.
- **`node_<uuid>.md`** — each node's markdown content as a separate file.
- **Export** — `.asktree.zip` containing `tree.json` + all `node_*.md` files.
- **Import** — drag & drop `.zip`, validate structure, load into storage.

---

## Core API

### TreeStore

```typescript
class TreeStore {
  constructor(adapter: StorageAdapter);

  // Tree operations
  createTree(rootContent: string, title: string): Promise<Node>;
  addChild(parentId: string, edge: Omit<Edge, "id" | "targetNodeId">, content: string): Promise<Node>;
  getNode(id: string): Node | undefined;
  getContent(id: string): Promise<string>;
  getRoot(): Node;
  getPath(id: string): Node[];           // Root → id chain
  removeNode(id: string): Promise<void>;  // Cascade delete subtree
  updateStatus(id: string, status: Node["status"]): void;

  // Serialization
  serialize(): TreeJSON;
  static deserialize(json: TreeJSON, adapter: StorageAdapter): Promise<TreeStore>;
  export(): Promise<Blob>;              // .zip
  static import(blob: Blob, adapter: StorageAdapter): Promise<TreeStore>;
}
```

### StorageAdapter (Interface)

```typescript
interface StorageAdapter {
  readNodeContent(nodeId: string): Promise<string>;
  writeNodeContent(nodeId: string, content: string): Promise<void>;
  deleteNodeContent(nodeId: string): Promise<void>;
  readTreeMeta(): Promise<TreeJSON | null>;
  writeTreeMeta(json: TreeJSON): Promise<void>;
  listNodeIds(): Promise<string[]>;
  clear(): Promise<void>;
}
```

### LLMService

```typescript
interface LLMConfig {
  endpoint: string;
  apiKey?: string;
  model: string;
}

interface AskOptions {
  question: string;
  contextSlices: ContextSlice[];
  template?: string;        // Custom prompt template
  signal?: AbortSignal;     // For cancellation
  onChunk?: (text: string) => void;  // Streaming callback
}

interface ContextSlice {
  nodeTitle: string;
  selectedText: string;     // The text user selected at this level
  surrounding: string;      // Cutout around selectedText
  depth: number;            // 0 = direct context, 1 = parent, ...
}

class LLMService {
  configure(config: LLMConfig, provider: "openai" | "ollama"): void;
  ask(options: AskOptions): Promise<string>;
  abort(): void;
}
```

### Prompt Module

```typescript
interface PromptConfig {
  maxDepth: number;               // Default: 3
  contextRadius: number[];        // Default: [200, 100, 50] — chars each depth
  template: string;               // System + User template with placeholders
}

function collectContext(
  nodeId: string,
  edgeId: string,
  store: TreeStore,
  config: PromptConfig
): ContextSlice[];

function renderPrompt(
  slices: ContextSlice[],
  question: string,
  template: string
): { system: string; user: string };
```

**Default template:**

```markdown
System: 你是一个帮助用户理解文章内容的学习助手。请基于提供的文章上下文，针对用户的问题给出清晰、结构化的解释。使用通俗易懂的语言，逐步深入。

User:
我正在学习以下文章，请基于上下文回答我的问题：

{ancestors}

---
{surrounding_text}
---

我对文中「{selected_text}」有疑问：

{user_question}
```

**Placeholders:** `{selected_text}`, `{surrounding_text}`, `{ancestors}`, `{full_article}`, `{root_title}`, `{path_summary}`

---

## UI Design

### Layout

```
┌───────────────────────────────────────────────────────┐
│  [←→]  Path: 📄 Root > ❓ Q1 > ❓ Q2   [Settings]    │  ← BreadcrumbBar
├────────┬──────────────────────────────────────────────┤
│        │  ┌────────────────┬──────────────────┐      │
│ Tree   │  │                │                  │      │
│ Nav    │  │  Left Panel    │   Right Panel    │      │
│ (fold) │  │  (parent node) │   (current Q&A)  │      │
│        │  │                │                  │      │
│        │  │  [selected]    │  Answer content  │      │
│        │  │  [highlighted] │                  │      │
│        │  │                │  ─────────────── │      │
│        │  │                │  [input bar     ]│      │
│        │  └────────────────┴──────────────────┘      │
└────────┴──────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|---------------|
| `App` | Top-level provider (TreeStore context + LLM config) |
| `AppHeader` | Import/Export/Settings buttons |
| `TreeSidebar` | Collapsible tree structure navigation |
| `BreadcrumbBar` | Path display: click to jump to any ancestor |
| `DualPanel` | Left/right split container, handles panel shift animation |
| `MarkdownPane` | Renders MD, handles text selection, shows floating "Ask" button |
| `QuestionInputBar` | Persistent bottom input, shows selected-text badge, send button |
| `SettingsModal` | LLM endpoint/apiKey/model, prompt template, context config |

### Interaction Flow

1. User selects text in either panel → **highlight only**, no popup
2. A floating button `🔍 Ask about "xxx"` appears near the selection
3. Click the button (or `Ctrl+Q`) → selected text auto-fills into the **QuestionInputBar** at the bottom of the right panel
4. Without any selection, the input bar accepts free-form questions
5. User sends question → LLM streams answer into the right panel
6. To drill deeper from the answer: select text in the right panel → same floating button → fill input bar → send → **right panel content shifts left** (becomes new parent), new answer streams into the right panel
7. Close the right panel → entire chain shifts right, revealing the previously hidden parent panel
8. Click any previously highlighted text in any visible panel → right panel immediately displays its associated answer
9. Tree sidebar and breadcrumb update in real-time as user navigates

### Node Management

- Each node has a status tag: `resolved` (understood) / `question` (pending)
- Deleting a node cascades to remove its entire subtree
- Connection lines (optional visual cue) from selected text in the left panel to the question title in the right panel

---

## Error Handling

### LLM Errors

| Error | Cause | Handling |
|-------|-------|----------|
| `NetworkError` | fetch fails (offline / unreachable) | Preserve input, show "Retry" button |
| `AuthError` | 401 / 403 | Prompt to check API key |
| `RateLimitError` | 429 | Wait `retry-after`, auto-retry |
| `ContextOverflow` | 400 / token exceeded | Auto-reduce `contextRadius`, retry |
| `StreamError` | SSE stream breaks | Preserve partial response + show retry |

### Storage Errors

| Error | Handling |
|-------|----------|
| `QuotaExceeded` | Prompt to export backup → offer to clear old data → retry |
| `Read/Write Fail` | Auto-retry 2 times → fail with error details |
| `Corrupt Import` | Validate `tree.json` schema before import → reject with explanation |

---

## Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| @asktree/core unit | vitest | TreeStore CRUD, traversal, serialization; Prompt context collection, template rendering; LLM request formatting, error classification; Export/Import zip correctness |
| React components | vitest + @testing-library/react | MarkdownPane selection flow, QuestionInputBar behavior, DualPanel shift, SettingsModal save |
| Storage adapters | vitest + fake-indexeddb | IndexedDB read/write, quota handling |
| E2E (optional) | Playwright | Full flow: paste article → select → ask → view answer → drill deeper → export |

---

## Decisions Log

| Decision | Choice |
|----------|--------|
| Delivery form | Pure frontend, Web App first |
| Backend | None (not needed) |
| Core implementation | TypeScript single package (@asktree/core) |
| UI framework | React |
| Build tool (core) | tsup (ESM + CJS) |
| Build tool (web) | Vite |
| Packaging | pnpm monorepo (packages/core + apps/*) |
| State management | React Context (no Redux) |
| Panel layout | Dual-panel (parent-child), not horizontal scroll |
| Question input | Persistent bar in right panel |
| Text selection trigger | Floating "Ask" button + auto-fill input |
| Navigation | Breadcrumb bar + collapsible left tree sidebar |
| Data storage | `tree.json` + `node_<uuid>.md` separation |
| Export format | `.asktree.zip` |
| LLM providers | OpenAI-compatible + Ollama |
| Prompt strategy | Configurable depth + radius, ancestor context collection |
