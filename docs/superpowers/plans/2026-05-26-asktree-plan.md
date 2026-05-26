# AskTree Implementation Plan

> **Agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Spec:** `docs/superpowers/specs/2026-05-26-asktree-design.md`

**Goal:** Build a pure-frontend tree-structured learning tool with React UI + TypeScript core.

**Architecture:** pnpm monorepo — `@asktree/core` (zero-deps, tsup → ESM+CJS) + `apps/web` (Vite+React). Core provides TreeStore, LLMService, Prompt; Web implements IndexedDB storage + UI.

**Tech Stack:** pnpm workspace, TypeScript, tsup, Vite, React 18, vitest, @testing-library/react, fake-indexeddb, marked, dompurify

---

## File Structure

```
asktree/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .gitignore
├── vitest.config.ts
├── packages/core/
│   ├── package.json / tsconfig.json / tsup.config.ts
│   └── src/
│       ├── index.ts
│       ├── types.ts
│       ├── storage-adapter.ts
│       ├── tree-store.ts
│       ├── prompt.ts
│       ├── llm-service.ts
│       ├── llm/ollama.ts
│       └── llm/openai-compat.ts
├── apps/web/
│   ├── package.json / tsconfig.json / vite.config.ts / index.html
│   └── src/
│       ├── main.tsx / App.tsx / App.css
│       ├── hooks/useTree.ts
│       ├── storage/indexeddb-adapter.ts
│       ├── lib/markdown.ts
│       └── components/
│           ├── AppHeader.tsx
│           ├── TreeSidebar.tsx
│           ├── BreadcrumbBar.tsx
│           ├── DualPanel.tsx
│           ├── MarkdownPane.tsx
│           ├── FloatingAskButton.tsx
│           ├── QuestionInputBar.tsx
│           └── SettingsModal.tsx
└── tests/
    ├── core/
    │   ├── tree-store.test.ts
    │   ├── prompt.test.ts
    │   └── llm-service.test.ts
    └── web/
        ├── storage/indexeddb-adapter.test.ts
        └── components/MarkdownPane.test.tsx
```

---

### Task 1: Project Scaffolding

**Files to create:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `vitest.config.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsup.config.ts`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`

- [ ] **Step 1:** Create `package.json`

```json
{
  "private": true,
  "name": "asktree-monorepo",
  "scripts": {
    "dev": "pnpm --filter @asktree/web dev",
    "build": "pnpm --filter @asktree/core build && pnpm --filter @asktree/web build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -p packages/core/tsconfig.json --noEmit && tsc -p apps/web/tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5",
    "vitest": "^2.0"
  }
}
```

- [ ] **Step 2:** Create `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3:** Create `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4:** Create `.gitignore`

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 5:** Create `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 6:** Create `packages/core/package.json`

```json
{
  "name": "@asktree/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "devDependencies": {
    "tsup": "^8.0"
  }
}
```

- [ ] **Step 7:** Create `packages/core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

- [ ] **Step 8:** Create `packages/core/tsup.config.ts`

```typescript
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 9:** Create `apps/web/package.json`

```json
{
  "name": "@asktree/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@asktree/core": "workspace:*",
    "react": "^18.3",
    "react-dom": "^18.3",
    "marked": "^14.0",
    "dompurify": "^3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0",
    "@testing-library/jest-dom": "^6.0",
    "@types/react": "^18.3",
    "@types/react-dom": "^18.3",
    "@types/dompurify": "^3.0",
    "@vitejs/plugin-react": "^4.0",
    "vite": "^5.0",
    "jsdom": "^25.0",
    "fake-indexeddb": "^6.0"
  }
}
```

- [ ] **Step 10:** Create `apps/web/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "jsx": "react-jsx" },
  "include": ["src"]
}
```

- [ ] **Step 11:** Create `apps/web/vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()] });
```

- [ ] **Step 12:** Create `apps/web/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>AskTree</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

- [ ] **Step 13:** Install dependencies

```bash
pnpm install
```
Expected: packages install without error

- [ ] **Step 14:** Verify core builds

```bash
pnpm --filter @asktree/core build
```
Expected: BUILD SUCCESS, creates `packages/core/dist/index.js`

- [ ] **Step 15:** Commit

```bash
git init && git add .gitignore && git commit -m "chore: initial commit"
git add .
git commit -m "chore: scaffold pnpm monorepo with core and web packages"
```

---

### Task 2: Core Types + StorageAdapter

**Files:** `packages/core/src/types.ts`, `packages/core/src/storage-adapter.ts`, `packages/core/src/index.ts`, `tests/core/types.test.ts`

- [ ] **Step 1:** Write `packages/core/src/types.ts`

```typescript
export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  selectedText: string;
  startPos: number;
  endPos: number;
  question: string;
}

export interface Node {
  id: string;
  title: string;
  type: "article" | "answer";
  status: "resolved" | "question";
  parentId: string | null;
  children: Edge[];
  createdAt: number;
}

export interface TreeJSON {
  version: number;
  rootNodeId: string;
  nodes: Record<string, Node>;
  createdAt: number;
  updatedAt: number;
}

export interface ExportBundle {
  version: 1;
  tree: TreeJSON;
  contents: Record<string, string>;
}

export interface LLMConfig {
  endpoint: string;
  apiKey?: string;
  model: string;
}

export interface ContextSlice {
  nodeTitle: string;
  selectedText: string;
  surrounding: string;
  depth: number;
}

export interface AskOptions {
  question: string;
  contextSlices: ContextSlice[];
  template?: string;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
}

export interface PromptConfig {
  maxDepth: number;
  contextRadius: number[];
  template: string;
}

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  maxDepth: 3,
  contextRadius: [200, 100, 50],
  template: "System: 你是一个帮助用户理解文章内容的学习助手。请基于提供的文章上下文，针对用户的问题给出清晰、结构化的解释。使用通俗易懂的语言，逐步深入。\n\nUser:\n我正在学习以下文章，请基于上下文回答我的问题：\n\n{ancestors}\n\n---\n{surrounding_text}\n---\n\n我对文中「{selected_text}」有疑问：\n\n{user_question}",
};
```

- [ ] **Step 2:** Write `packages/core/src/storage-adapter.ts`

```typescript
import type { TreeJSON } from "./types";

export interface StorageAdapter {
  readNodeContent(nodeId: string): Promise<string>;
  writeNodeContent(nodeId: string, content: string): Promise<void>;
  deleteNodeContent(nodeId: string): Promise<void>;
  readTreeMeta(): Promise<TreeJSON | null>;
  writeTreeMeta(json: TreeJSON): Promise<void>;
  listNodeIds(): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private contents = new Map<string, string>();
  private meta: TreeJSON | null = null;

  async readNodeContent(nodeId: string): Promise<string> {
    const c = this.contents.get(nodeId);
    if (c === undefined) throw new Error(`Node content not found: ${nodeId}`);
    return c;
  }

  async writeNodeContent(nodeId: string, content: string): Promise<void> {
    this.contents.set(nodeId, content);
  }

  async deleteNodeContent(nodeId: string): Promise<void> {
    this.contents.delete(nodeId);
  }

  async readTreeMeta(): Promise<TreeJSON | null> { return this.meta; }

  async writeTreeMeta(json: TreeJSON): Promise<void> { this.meta = json; }

  async listNodeIds(): Promise<string[]> { return Array.from(this.contents.keys()); }

  async clear(): Promise<void> { this.contents.clear(); this.meta = null; }
}
```

- [ ] **Step 3:** Write `packages/core/src/index.ts`

```typescript
export type { Node, Edge, TreeJSON, ExportBundle, LLMConfig, ContextSlice, AskOptions, PromptConfig } from "./types";
export { DEFAULT_PROMPT_CONFIG } from "./types";
export type { StorageAdapter } from "./storage-adapter";
export { InMemoryStorageAdapter } from "./storage-adapter";
```

- [ ] **Step 4:** Write `tests/core/types.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import type { Node, Edge, TreeJSON } from "@asktree/core";
import { InMemoryStorageAdapter } from "@asktree/core";

describe("types", () => {
  it("should construct a valid Node", () => {
    const node: Node = { id: "n1", title: "Root", type: "article", status: "question", parentId: null, children: [], createdAt: Date.now() };
    expect(node.type).toBe("article");
  });

  it("should construct a valid Edge", () => {
    const edge: Edge = { id: "e1", sourceNodeId: "n1", targetNodeId: "n2", selectedText: "abc", startPos: 12, endPos: 15, question: "What is abc?" };
    expect(edge.selectedText).toBe("abc");
  });
});

describe("InMemoryStorageAdapter", () => {
  it("should read/write content", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("n1", "# Hello");
    expect(await a.readNodeContent("n1")).toBe("# Hello");
  });

  it("should read/write meta", async () => {
    const a = new InMemoryStorageAdapter();
    const json: TreeJSON = { version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
    await a.writeTreeMeta(json);
    expect((await a.readTreeMeta())?.rootNodeId).toBe("r");
  });

  it("should delete content", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("n1", "data");
    await a.deleteNodeContent("n1");
    await expect(a.readNodeContent("n1")).rejects.toThrow();
  });

  it("should list ids and clear", async () => {
    const a = new InMemoryStorageAdapter();
    await a.writeNodeContent("a", "a");
    await a.writeNodeContent("b", "b");
    expect(await a.listNodeIds()).toHaveLength(2);
    await a.clear();
    expect(await a.listNodeIds()).toHaveLength(0);
    expect(await a.readTreeMeta()).toBeNull();
  });
});
```

- [ ] **Step 5:** Run tests

```bash
pnpm test
```
Expected: PASS

- [ ] **Step 6:** Commit

```bash
git add packages/core/src/ tests/core/
git commit -m "feat: core types, StorageAdapter interface, InMemoryStorageAdapter"
```

---

### Task 3: TreeStore — createTree, getNode, getRoot, getContent, serialize

**Files:** `packages/core/src/tree-store.ts`, `tests/core/tree-store.test.ts`, modify `packages/core/src/index.ts`

- [ ] **Step 1:** Write `tests/core/tree-store.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TreeStore, InMemoryStorageAdapter } from "@asktree/core";

describe("TreeStore", () => {
  let adapter: InMemoryStorageAdapter;
  let store: TreeStore;

  beforeEach(() => { adapter = new InMemoryStorageAdapter(); store = new TreeStore(adapter); });

  describe("createTree", () => {
    it("should create a root node and persist content", async () => {
      const root = await store.createTree("# Hello\n\nWorld", "Root Article");
      expect(root.type).toBe("article");
      expect(root.parentId).toBeNull();
      expect(await store.getContent(root.id)).toBe("# Hello\n\nWorld");
    });

    it("should throw if tree already exists", async () => {
      await store.createTree("content", "title");
      await expect(store.createTree("more", "another")).rejects.toThrow("Tree already exists");
    });
  });

  describe("getNode", () => {
    it("should return a node by id", async () => {
      const root = await store.createTree("content", "Root");
      expect(store.getNode(root.id)).toBeDefined();
    });

    it("should return undefined for unknown id", () => {
      expect(store.getNode("nonexistent")).toBeUndefined();
    });
  });

  describe("getRoot", () => {
    it("should return the root", async () => {
      const root = await store.createTree("content", "Root");
      expect(store.getRoot().id).toBe(root.id);
    });

    it("should throw if no tree", () => {
      expect(() => store.getRoot()).toThrow("No tree exists");
    });
  });
});
```

- [ ] **Step 2:** Run tests — expect FAIL

```bash
pnpm test
```

- [ ] **Step 3:** Write `packages/core/src/tree-store.ts`

```typescript
import type { Node, Edge, TreeJSON, ExportBundle } from "./types";
import type { StorageAdapter } from "./storage-adapter";

export class TreeStore {
  private rootNodeId: string | null = null;
  private nodes: Map<string, Node> = new Map();

  constructor(private adapter: StorageAdapter) {}

  async createTree(rootContent: string, title: string): Promise<Node> {
    if (this.rootNodeId !== null) throw new Error("Tree already exists");
    const id = crypto.randomUUID();
    const now = Date.now();
    const node: Node = {
      id, title, type: "article", status: "question",
      parentId: null, children: [], createdAt: now,
    };
    this.nodes.set(id, node);
    this.rootNodeId = id;
    await this.adapter.writeNodeContent(id, rootContent);
    await this.persist();
    return { ...node };
  }

  getNode(id: string): Node | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  getRoot(): Node {
    if (!this.rootNodeId) throw new Error("No tree exists");
    return { ...this.nodes.get(this.rootNodeId)! };
  }

  getAllNodes(): Node[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  async getContent(id: string): Promise<string> {
    return this.adapter.readNodeContent(id);
  }

  private async persist(): Promise<void> {
    await this.adapter.writeTreeMeta(this.serialize());
  }

  serialize(): TreeJSON {
    if (!this.rootNodeId) throw new Error("No tree exists");
    const nodesObj: Record<string, Node> = {};
    for (const [id, node] of this.nodes) nodesObj[id] = { ...node };
    return {
      version: 1,
      rootNodeId: this.rootNodeId,
      nodes: nodesObj,
      createdAt: this.nodes.get(this.rootNodeId)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }
}
```

- [ ] **Step 4:** Update `packages/core/src/index.ts` (add export)

```typescript
export { TreeStore } from "./tree-store";
```

- [ ] **Step 5:** Run tests — expect PASS

```bash
pnpm test
```

- [ ] **Step 6:** Commit

```bash
git add packages/core/src/tree-store.ts tests/core/tree-store.test.ts packages/core/src/index.ts
git commit -m "feat: TreeStore — createTree, getNode, getRoot, getContent, serialize"
```

---

### Task 4: TreeStore — addChild, getPath

**Files:** modify `packages/core/src/tree-store.ts`, `tests/core/tree-store.test.ts`

- [ ] **Step 1:** Add tests to `tests/core/tree-store.test.ts`

Add these `describe` blocks inside the main `describe("TreeStore", ...)`:

```typescript
  describe("addChild", () => {
    it("should add a child node with an edge", async () => {
      const root = await store.createTree("# Math", "Math Article");
      const child = await store.addChild(root.id, {
        selectedText: "group", startPos: 10, endPos: 15, question: "What is a group?",
      }, "A group is a set with an operation...");

      expect(child.type).toBe("answer");
      expect(child.parentId).toBe(root.id);

      const rootRefreshed = store.getNode(root.id)!;
      expect(rootRefreshed.children).toHaveLength(1);
      expect(rootRefreshed.children[0].selectedText).toBe("group");
      expect(await store.getContent(child.id)).toBe("A group is a set with an operation...");
    });

    it("should throw if parent does not exist", async () => {
      await store.createTree("content", "Root");
      await expect(store.addChild("fakeid", {
        selectedText: "x", startPos: 0, endPos: 1, question: "q",
      }, "answer")).rejects.toThrow("Parent node not found");
    });
  });

  describe("getPath", () => {
    it("should return the path from root to grandchild", async () => {
      const root = await store.createTree("# Title", "Root");
      const child = await store.addChild(root.id, {
        selectedText: "x", startPos: 0, endPos: 1, question: "q?",
      }, "Answer 1");
      const grandchild = await store.addChild(child.id, {
        selectedText: "y", startPos: 0, endPos: 1, question: "q2?",
      }, "Answer 2");

      const path = store.getPath(grandchild.id);
      expect(path).toHaveLength(3);
      expect(path[0].id).toBe(root.id);
      expect(path[1].id).toBe(child.id);
      expect(path[2].id).toBe(grandchild.id);
    });
  });
```

- [ ] **Step 2:** Run tests — expect FAIL

- [ ] **Step 3:** Add methods to TreeStore

```typescript
  async addChild(
    parentId: string,
    edgeData: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">,
    content: string
  ): Promise<Node> {
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error("Parent node not found");

    const childId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();
    const now = Date.now();

    const edge: Edge = { id: edgeId, sourceNodeId: parentId, targetNodeId: childId, ...edgeData };

    const child: Node = {
      id: childId, title: edgeData.question, type: "answer", status: "question",
      parentId, children: [], createdAt: now,
    };

    parent.children = [...parent.children, edge];
    this.nodes.set(parentId, parent);
    this.nodes.set(childId, child);

    await this.adapter.writeNodeContent(childId, content);
    await this.persist();
    return { ...child };
  }

  getPath(id: string): Node[] {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");
    const path: Node[] = [];
    let current: Node | undefined = node;
    while (current) {
      path.unshift({ ...current });
      current = current.parentId ? this.nodes.get(current.parentId) : undefined;
    }
    return path;
  }
```

- [ ] **Step 4:** Run tests — expect PASS

- [ ] **Step 5:** Commit

```bash
git add packages/core/src/tree-store.ts tests/core/tree-store.test.ts
git commit -m "feat: TreeStore — addChild, getPath"
```

---

### Task 5: TreeStore — removeNode, updateStatus, deserialize, export/import

**Files:** modify `packages/core/src/tree-store.ts`, `tests/core/tree-store.test.ts`

- [ ] **Step 1:** Add tests to tree-store test

```typescript
  describe("updateStatus", () => {
    it("should update node status", async () => {
      const root = await store.createTree("c", "Root");
      store.updateStatus(root.id, "resolved");
      expect(store.getNode(root.id)!.status).toBe("resolved");
    });
  });

  describe("removeNode", () => {
    it("should cascade delete a subtree", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "a", startPos: 0, endPos: 1, question: "q1" }, "c");
      const grandchild = await store.addChild(child.id, { selectedText: "b", startPos: 0, endPos: 1, question: "q2" }, "gc");
      await store.removeNode(child.id);
      expect(store.getNode(child.id)).toBeUndefined();
      expect(store.getNode(grandchild.id)).toBeUndefined();
      expect(store.getNode(root.id)!.children).toHaveLength(0);
    });

    it("should throw when removing root", async () => {
      const root = await store.createTree("c", "Root");
      await expect(store.removeNode(root.id)).rejects.toThrow("Cannot remove root node");
    });

    it("should delete content from storage", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q" }, "md");
      await store.removeNode(child.id);
      await expect(store.getContent(child.id)).rejects.toThrow();
    });
  });

  describe("deserialize", () => {
    it("should restore a tree from JSON", async () => {
      const root = await store.createTree("r", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q?" }, "child");
      const json = store.serialize();
      const adapter2 = new InMemoryStorageAdapter();
      const store2 = await TreeStore.deserialize(json, adapter2);
      expect(store2.getRoot().title).toBe("Root");
      expect(store2.getNode(child.id)!.title).toBe("q?");
    });
  });

  describe("export / import", () => {
    it("should export and import a bundle", async () => {
      const root = await store.createTree("root md", "Root");
      const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q?" }, "child md");
      const bundle = await store.exportBundle();
      expect(bundle.version).toBe(1);
      expect(bundle.contents[root.id]).toBe("root md");

      const adapter2 = new InMemoryStorageAdapter();
      const store2 = await TreeStore.importBundle(bundle, adapter2);
      expect(store2.getRoot().title).toBe("Root");
      expect(store2.getAllNodes()).toHaveLength(2);
      expect(await store2.getContent(child.id)).toBe("child md");
    });
  });
```

- [ ] **Step 2:** Run tests — expect FAIL

- [ ] **Step 3:** Add methods to TreeStore

```typescript
  updateStatus(id: string, status: Node["status"]): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");
    node.status = status;
    this.persist();
  }

  async removeNode(id: string): Promise<void> {
    if (id === this.rootNodeId) throw new Error("Cannot remove root node");
    const node = this.nodes.get(id);
    if (!node) throw new Error("Node not found");

    const toRemove = this.collectSubtreeIds(id);
    toRemove.push(id);
    for (const removeId of toRemove) {
      await this.adapter.deleteNodeContent(removeId).catch(() => {});
      this.nodes.delete(removeId);
    }

    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((e) => e.targetNodeId !== id);
        this.nodes.set(node.parentId, parent);
      }
    }
    await this.persist();
  }

  private collectSubtreeIds(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    const ids: string[] = [];
    for (const edge of node.children) {
      ids.push(edge.targetNodeId);
      ids.push(...this.collectSubtreeIds(edge.targetNodeId));
    }
    return ids;
  }

  static async deserialize(json: TreeJSON, adapter: StorageAdapter): Promise<TreeStore> {
    const store = new TreeStore(adapter);
    for (const [id, node] of Object.entries(json.nodes)) {
      store.nodes.set(id, { ...node });
    }
    store.rootNodeId = json.rootNodeId;
    return store;
  }

  async exportBundle(): Promise<ExportBundle> {
    const tree = this.serialize();
    const contents: Record<string, string> = {};
    for (const id of this.nodes.keys()) {
      try { contents[id] = await this.adapter.readNodeContent(id); }
      catch { contents[id] = ""; }
    }
    return { version: 1, tree, contents };
  }

  static async importBundle(bundle: ExportBundle, adapter: StorageAdapter): Promise<TreeStore> {
    const store = await TreeStore.deserialize(bundle.tree, adapter);
    for (const [id, content] of Object.entries(bundle.contents)) {
      await adapter.writeNodeContent(id, content);
    }
    return store;
  }
```

- [ ] **Step 4:** Run tests — expect PASS

- [ ] **Step 5:** Commit

```bash
git add packages/core/src/tree-store.ts tests/core/tree-store.test.ts
git commit -m "feat: TreeStore — removeNode, updateStatus, deserialize, export/import"
```

---

### Task 6: Prompt — context collection and template rendering

**Files:** `packages/core/src/prompt.ts`, `tests/core/prompt.test.ts`, modify `packages/core/src/index.ts`

- [ ] **Step 1:** Write `packages/core/src/prompt.ts`

```typescript
import { DEFAULT_PROMPT_CONFIG, type PromptConfig, type ContextSlice } from "./types";
import type { TreeStore } from "./tree-store";

function cutSurrounding(content: string, startPos: number, endPos: number, radius: number): string {
  const before = content.slice(Math.max(0, startPos - radius), startPos);
  const selected = content.slice(startPos, endPos);
  const after = content.slice(endPos, endPos + radius);
  return before + selected + after;
}

export async function collectContext(
  nodeId: string,
  _edgeId: string,
  store: TreeStore,
  config: PromptConfig = DEFAULT_PROMPT_CONFIG
): Promise<ContextSlice[]> {
  const slices: ContextSlice[] = [];
  const path = store.getPath(nodeId);

  for (let i = path.length - 1; i >= 0 && slices.length <= config.maxDepth; i--) {
    const depth = path.length - 1 - i;
    const radius = config.contextRadius[depth] ?? config.contextRadius[config.contextRadius.length - 1];
    const node = path[i];
    const content = await store.getContent(node.id);

    let selectedText = "";
    let startPos = 0;
    let endPos = 0;

    if (node.parentId && depth > 0) {
      const parent = store.getNode(node.parentId);
      const edge = parent?.children.find((e) => e.targetNodeId === node.id);
      if (edge?.selectedText) {
        selectedText = edge.selectedText;
        startPos = edge.startPos;
        endPos = edge.endPos;
      }
    }

    const surrounding = selectedText
      ? cutSurrounding(content, startPos, endPos, radius)
      : content.slice(0, radius * 2);

    slices.push({ nodeTitle: node.title, selectedText, surrounding, depth });
  }

  return slices;
}

export function renderPrompt(
  slices: ContextSlice[],
  question: string,
  template: string
): { system: string; user: string } {
  const directSlice = slices.find((s) => s.depth === 0) ?? slices[0];
  const ancestors = slices
    .filter((s) => s.depth > 0)
    .sort((a, b) => b.depth - a.depth)
    .map((s) => `[${s.nodeTitle}]\n${s.surrounding}`)
    .join("\n\n");

  let text = template
    .replace("{selected_text}", directSlice?.selectedText || "this section")
    .replace("{surrounding_text}", directSlice?.surrounding || "")
    .replace("{ancestors}", ancestors || "（无更上层上下文）")
    .replace("{user_question}", question)
    .replace("{root_title}", slices[slices.length - 1]?.nodeTitle || "")
    .replace("{full_article}", "")
    .replace("{path_summary}", slices.map((s) => s.nodeTitle).join(" → "));

  const parts = text.split("User:");
  const system = parts[0]?.replace(/^System:\s*/, "").trim() || "";
  const user = parts[1]?.trim() || text;
  return { system, user };
}
```

- [ ] **Step 2:** Write `tests/core/prompt.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { renderPrompt, collectContext } from "@asktree/core";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

describe("renderPrompt", () => {
  it("should render the default template", () => {
    const result = renderPrompt(
      [
        { nodeTitle: "Root", selectedText: "abc", surrounding: "The quick brown abc fox jumps", depth: 0 },
        { nodeTitle: "Parent", selectedText: "math", surrounding: "Math is fundamental", depth: 1 },
      ],
      "What is abc?",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.system).toContain("学习助手");
    expect(result.user).toContain("quick brown abc fox jumps");
    expect(result.user).toContain("What is abc?");
  });

  it("should handle empty selectedText", () => {
    const result = renderPrompt(
      [{ nodeTitle: "Root", selectedText: "", surrounding: "Some article text here", depth: 0 }],
      "Tell me more",
      DEFAULT_PROMPT_CONFIG.template
    );
    expect(result.user).toContain("Some article text here");
    expect(result.user).toContain("Tell me more");
  });
});
```

- [ ] **Step 3:** Update `packages/core/src/index.ts`

```typescript
export { collectContext, renderPrompt } from "./prompt";
```

- [ ] **Step 4:** Run tests — expect PASS

```bash
pnpm test
```

- [ ] **Step 5:** Commit

```bash
git add packages/core/src/prompt.ts tests/core/prompt.test.ts packages/core/src/index.ts
git commit -m "feat: prompt — collectContext, renderPrompt"
```

---

### Task 7: LLMService — Ollama + OpenAI-compatible providers

**Files:** `packages/core/src/llm/ollama.ts`, `packages/core/src/llm/openai-compat.ts`, `packages/core/src/llm-service.ts`, `tests/core/llm-service.test.ts`, modify `packages/core/src/index.ts`

- [ ] **Step 1:** Write `packages/core/src/llm/ollama.ts`

```typescript
import type { LLMConfig, AskOptions } from "../types";

export async function askOllama(config: LLMConfig, options: AskOptions): Promise<string> {
  const url = `${config.endpoint}/api/generate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt: options.contextSlices.map((s) => s.surrounding).join("\n\n") + "\n\nQuestion: " + options.question,
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error("AuthError: check API access");
    if (resp.status === 429) throw new Error("RateLimitError");
    throw new Error(`Ollama error: ${resp.status}`);
  }

  const json = await resp.json();
  return json.response ?? json.message ?? "";
}
```

- [ ] **Step 2:** Write `packages/core/src/llm/openai-compat.ts`

```typescript
import type { LLMConfig, AskOptions } from "../types";

export async function askOpenAICompat(config: LLMConfig, options: AskOptions): Promise<string> {
  const url = `${config.endpoint}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: "You are a helpful learning assistant. Explain concepts clearly." },
        {
          role: "user",
          content: options.contextSlices.map((s) => s.surrounding).join("\n\n") +
            `\n\nQuestion about "${options.contextSlices[0]?.selectedText || "this"}": ${options.question}`,
        },
      ],
      stream: false,
    }),
    signal: options.signal,
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) throw new Error("AuthError: invalid API key");
    if (resp.status === 429) throw new Error("RateLimitError");
    throw new Error(`API error: ${resp.status}`);
  }

  const json = await resp.json();
  return json.choices?.[0]?.message?.content ?? "";
}
```

- [ ] **Step 3:** Write `packages/core/src/llm-service.ts`

```typescript
import type { LLMConfig, AskOptions } from "./types";
import { askOllama } from "./llm/ollama";
import { askOpenAICompat } from "./llm/openai-compat";

export type LLMProvider = "ollama" | "openai";

export class LLMService {
  private config: LLMConfig | null = null;
  private provider: LLMProvider = "openai";
  private controller: AbortController | null = null;

  configure(config: LLMConfig, provider: LLMProvider): void {
    this.config = config;
    this.provider = provider;
  }

  async ask(options: AskOptions): Promise<string> {
    if (!this.config) throw new Error("LLM not configured");
    this.controller = new AbortController();
    const askOptions: AskOptions = { ...options, signal: options.signal ?? this.controller.signal };

    switch (this.provider) {
      case "ollama": return askOllama(this.config, askOptions);
      case "openai": return askOpenAICompat(this.config, askOptions);
    }
  }

  abort(): void { this.controller?.abort(); }

  getConfig(): LLMConfig | null { return this.config; }
}
```

- [ ] **Step 4:** Write `tests/core/llm-service.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { LLMService } from "@asktree/core";

describe("LLMService", () => {
  it("should throw if not configured", async () => {
    const service = new LLMService();
    await expect(service.ask({ question: "test", contextSlices: [] })).rejects.toThrow("LLM not configured");
  });

  it("should store configuration", () => {
    const service = new LLMService();
    service.configure({ endpoint: "http://localhost:11434", model: "llama3" }, "ollama");
    expect(service.getConfig()?.model).toBe("llama3");
  });
});
```

- [ ] **Step 5:** Update `packages/core/src/index.ts`

```typescript
export { LLMService } from "./llm-service";
export type { LLMProvider } from "./llm-service";
```

- [ ] **Step 6:** Run tests — expect PASS

- [ ] **Step 7:** Commit

```bash
git add packages/core/src/llm/ packages/core/src/llm-service.ts tests/core/llm-service.test.ts packages/core/src/index.ts
git commit -m "feat: LLMService — Ollama and OpenAI-compatible providers"
```

---

### Task 8: Web App — IndexedDB StorageAdapter + Entry Point

**Files:** `apps/web/src/storage/indexeddb-adapter.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/App.css` (empty), `tests/web/storage/indexeddb-adapter.test.ts`

- [ ] **Step 1:** Write `apps/web/src/storage/indexeddb-adapter.ts`

```typescript
import type { StorageAdapter, TreeJSON } from "@asktree/core";

const DB_NAME = "asktree";
const DB_VERSION = 1;
const META_KEY = "tree_meta";
const CONTENT_STORE = "node_contents";
const META_STORE = "meta";

export class IndexedDBStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONTENT_STORE)) db.createObjectStore(CONTENT_STORE);
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      request.onsuccess = () => { this.db = request.result; resolve(this.db); };
      request.onerror = () => reject(request.error);
    });
  }

  async readNodeContent(nodeId: string): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readonly");
      const req = tx.objectStore(CONTENT_STORE).get(nodeId);
      req.onsuccess = () => {
        if (req.result === undefined) reject(new Error(`Node content not found: ${nodeId}`));
        else resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async writeNodeContent(nodeId: string, content: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite");
      tx.objectStore(CONTENT_STORE).put(content, nodeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteNodeContent(nodeId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readwrite");
      tx.objectStore(CONTENT_STORE).delete(nodeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async readTreeMeta(): Promise<TreeJSON | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(META_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async writeTreeMeta(json: TreeJSON): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put(json, META_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listNodeIds(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONTENT_STORE, "readonly");
      const req = tx.objectStore(CONTENT_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CONTENT_STORE, META_STORE], "readwrite");
      tx.objectStore(CONTENT_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
```

- [ ] **Step 2:** Write `apps/web/src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
```

- [ ] **Step 3:** Write `apps/web/src/App.tsx` (placeholder)

```tsx
export default function App() {
  return <div>AskTree</div>;
}
```

- [ ] **Step 4:** Write `tests/web/storage/indexeddb-adapter.test.ts`

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { IndexedDBStorageAdapter } from "../../apps/web/src/storage/indexeddb-adapter";

describe("IndexedDBStorageAdapter", () => {
  it("should write and read node content", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("n1", "# Hello World");
    expect(await adapter.readNodeContent("n1")).toBe("# Hello World");
  });

  it("should write and read tree meta", async () => {
    const adapter = new IndexedDBStorageAdapter();
    const json = { version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
    await adapter.writeTreeMeta(json);
    expect((await adapter.readTreeMeta())?.rootNodeId).toBe("r");
  });

  it("should delete node content", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("n1", "data");
    await adapter.deleteNodeContent("n1");
    await expect(adapter.readNodeContent("n1")).rejects.toThrow();
  });

  it("should list node ids", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeNodeContent("b", "b");
    const ids = await adapter.listNodeIds();
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("should clear all data", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.writeNodeContent("a", "a");
    await adapter.writeTreeMeta({ version: 1, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 });
    await adapter.clear();
    expect(await adapter.listNodeIds()).toHaveLength(0);
    expect(await adapter.readTreeMeta()).toBeNull();
  });
});
```

- [ ] **Step 5:** Run tests

```bash
pnpm test
```
Expected: PASS

- [ ] **Step 6:** Verify web app builds

```bash
pnpm --filter @asktree/web build
```
Expected: Build succeeds

- [ ] **Step 7:** Commit

```bash
git add apps/web/ tests/web/
git commit -m "feat: IndexedDB StorageAdapter + web app entry point"
```

---

### Task 9: React — TreeProvider Context + Layout Shell

**Files:** `apps/web/src/hooks/useTree.ts`, `apps/web/src/App.tsx` (replace placeholder), `apps/web/src/App.css`, `apps/web/src/components/AppHeader.tsx`, `apps/web/src/components/TreeSidebar.tsx`, `apps/web/src/components/BreadcrumbBar.tsx`

- [ ] **Step 1:** Write `apps/web/src/hooks/useTree.ts`

```tsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { TreeStore, LLMService, type Node, type Edge, type ExportBundle, type PromptConfig, DEFAULT_PROMPT_CONFIG } from "@asktree/core";
import { IndexedDBStorageAdapter } from "../storage/indexeddb-adapter";

interface TreeContextValue {
  store: TreeStore;
  llm: LLMService;
  activePath: Node[];
  navigateTo: (nodeId: string) => void;
  navigateUp: () => void;
  createRootTree: (content: string, title: string) => Promise<void>;
  addChildNode: (parentId: string, edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">, answerContent: string) => Promise<Node>;
  selectedText: { text: string; start: number; end: number; nodeId: string } | null;
  setSelectedText: (s: typeof selectedText) => void;
  importBundle: (bundle: ExportBundle) => Promise<void>;
  exportBundle: () => Promise<ExportBundle | null>;
  promptConfig: PromptConfig;
  setPromptConfig: (c: PromptConfig) => void;
  isLoading: boolean;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export function TreeProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef(new TreeStore(new IndexedDBStorageAdapter()));
  const llmRef = useRef(new LLMService());
  const [activePath, setActivePath] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedText, setSelectedText] = useState<TreeContextValue["selectedText"]>(null);
  const [promptConfig, setPromptConfig] = useState<PromptConfig>(DEFAULT_PROMPT_CONFIG);

  useEffect(() => {
    (async () => {
      try {
        const adapter = new IndexedDBStorageAdapter();
        const meta = await adapter.readTreeMeta();
        if (meta) {
          const store = await TreeStore.deserialize(meta, adapter);
          storeRef.current = store;
          setActivePath([store.getRoot()]);
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const navigateTo = useCallback((nodeId: string) => {
    setActivePath(storeRef.current.getPath(nodeId));
  }, []);

  const navigateUp = useCallback(() => {
    if (activePath.length > 1) setActivePath((p) => p.slice(0, -1));
  }, [activePath]);

  const createRootTree = useCallback(async (content: string, title: string) => {
    const root = await storeRef.current.createTree(content, title);
    setActivePath([root]);
  }, []);

  const addChildNode = useCallback(async (
    parentId: string,
    edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">,
    answerContent: string,
  ) => {
    const child = await storeRef.current.addChild(parentId, edge, answerContent);
    setActivePath(storeRef.current.getPath(child.id));
    return child;
  }, []);

  const importBundleFn = useCallback(async (bundle: ExportBundle) => {
    const adapter = new IndexedDBStorageAdapter();
    const store = await TreeStore.importBundle(bundle, adapter);
    storeRef.current = store;
    setActivePath([store.getRoot()]);
  }, []);

  const exportBundleFn = useCallback(async () => {
    try { return await storeRef.current.exportBundle(); }
    catch { return null; }
  }, []);

  return (
    <TreeContext.Provider value={{
      store: storeRef.current, llm: llmRef.current, activePath, navigateTo, navigateUp,
      createRootTree, addChildNode, selectedText, setSelectedText,
      importBundle: importBundleFn, exportBundle: exportBundleFn, promptConfig, setPromptConfig, isLoading,
    }}>
      {children}
    </TreeContext.Provider>
  );
}

export function useTree() {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error("useTree must be used within TreeProvider");
  return ctx;
}
```

- [ ] **Step 2:** Write `apps/web/src/App.tsx` (layout shell)

```tsx
import { useState } from "react";
import { TreeProvider, useTree } from "./hooks/useTree";
import { AppHeader } from "./components/AppHeader";
import { TreeSidebar } from "./components/TreeSidebar";
import { BreadcrumbBar } from "./components/BreadcrumbBar";
import { DualPanel } from "./components/DualPanel";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

function AppContent() {
  const { isLoading } = useTree();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (isLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8b949e" }}>Loading...</div>;

  return (
    <div className="app">
      <AppHeader onSettings={() => setShowSettings(true)} onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="app-body">
        {sidebarOpen && <TreeSidebar />}
        <div className="app-main">
          <BreadcrumbBar />
          <DualPanel />
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function App() {
  return <TreeProvider><AppContent /></TreeProvider>;
}
```

- [ ] **Step 3:** Write `apps/web/src/App.css`

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  height: 100vh;
  overflow: hidden;
}

#root { height: 100%; }

.app { display: flex; flex-direction: column; height: 100%; }

.app-header {
  display: flex; align-items: center; padding: 8px 16px;
  background: #161b22; border-bottom: 1px solid #30363d;
  gap: 12px; flex-shrink: 0;
}

.app-header h1 { font-size: 16px; color: #58a6ff; margin-right: auto; }

.app-header button {
  padding: 4px 12px; background: #21262d; border: 1px solid #30363d;
  border-radius: 6px; color: #c9d1d9; cursor: pointer; font-size: 12px;
}

.app-header button:hover { background: #30363d; }

.app-body { display: flex; flex: 1; overflow: hidden; }

.app-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

.tree-sidebar {
  width: 220px; background: #161b22; border-right: 1px solid #30363d;
  overflow-y: auto; padding: 8px; flex-shrink: 0;
}

.tree-sidebar h3 { font-size: 11px; text-transform: uppercase; color: #8b949e; margin-bottom: 8px; }

.tree-node {
  font-size: 12px; padding: 3px 6px; cursor: pointer; border-radius: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #8b949e;
}

.tree-node:hover { background: #21262d; color: #c9d1d9; }
.tree-node.active { background: #1f6feb22; color: #58a6ff; }

.tree-node .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }

.breadcrumb-bar {
  display: flex; align-items: center; padding: 6px 16px;
  background: #161b22; border-bottom: 1px solid #30363d;
  gap: 4px; font-size: 12px; flex-shrink: 0; overflow-x: auto;
}

.crumb { color: #58a6ff; cursor: pointer; padding: 2px 4px; border-radius: 3px; white-space: nowrap; }
.crumb:hover { background: #21262d; }
.crumb.active { color: #e2b714; background: #e2b71415; }
.separator { color: #484f58; }

.dual-panel { display: flex; flex: 1; overflow: hidden; }

.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel:first-child { border-right: 1px solid #30363d; }

.panel-header {
  padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #21262d;
  display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
}

.panel-header .node-type { font-size: 10px; color: #8b949e; }

.markdown-pane {
  flex: 1; padding: 16px; overflow-y: auto; font-size: 14px;
  line-height: 1.7; position: relative; background: #0d1117;
}

.markdown-pane :first-child { margin-top: 0; }
.markdown-pane h1, .markdown-pane h2, .markdown-pane h3 { margin: 16px 0 8px; color: #c9d1d9; }
.markdown-pane p { margin: 8px 0; }
.markdown-pane code { background: #161b22; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
.markdown-pane pre { background: #161b22; padding: 12px; border-radius: 6px; overflow-x: auto; }

.floating-ask {
  position: absolute; z-index: 100; background: #1e1e3a;
  border: 1px solid #e2b714; border-radius: 6px; padding: 4px 10px;
  font-size: 12px; color: #ccc; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  display: flex; align-items: center; gap: 6px; white-space: nowrap;
}
.floating-ask:hover { background: #232340; }

.question-input-bar {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-top: 1px solid #30363d; background: #161b22; flex-shrink: 0;
}

.context-badge {
  font-size: 12px; color: #e2b714; background: #e2b71420;
  padding: 2px 8px; border-radius: 4px; flex-shrink: 0;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.question-input-bar input {
  flex: 1; background: #0d1117; border: 1px solid #30363d;
  border-radius: 6px; padding: 6px 12px; color: #c9d1d9; font-size: 13px;
}
.question-input-bar input:focus { outline: none; border-color: #58a6ff; }

.question-input-bar button {
  padding: 6px 14px; background: #238636; border: 1px solid #238636;
  border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; flex-shrink: 0;
}
.question-input-bar button:hover { background: #2ea043; }
.question-input-bar button:disabled { opacity: 0.5; cursor: default; }

.settings-modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6); display: flex; align-items: center;
  justify-content: center; z-index: 1000;
}

.settings-modal {
  background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 24px; width: 480px; max-height: 80vh; overflow-y: auto;
}

.settings-modal h2 { margin-bottom: 16px; color: #c9d1d9; font-size: 18px; }

.settings-modal label { display: block; font-size: 12px; color: #8b949e; margin-bottom: 4px; margin-top: 12px; }

.settings-modal input, .settings-modal select, .settings-modal textarea {
  width: 100%; background: #0d1117; border: 1px solid #30363d;
  border-radius: 6px; padding: 6px 10px; color: #c9d1d9; font-size: 13px; font-family: monospace;
}

.settings-modal textarea { min-height: 200px; font-size: 11px; resize: vertical; }

.settings-modal .btn-row { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
.settings-modal .btn-row button {
  padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
  border: 1px solid #30363d; background: #21262d; color: #c9d1d9;
}
.settings-modal .btn-row button.primary { background: #238636; border-color: #238636; color: #fff; }

.empty-state {
  display: flex; flex: 1; flex-direction: column; align-items: center;
  justify-content: center; color: #484f58; gap: 12px;
}

.empty-state textarea {
  width: 500px; height: 200px; background: #0d1117; border: 1px solid #30363d;
  border-radius: 8px; padding: 12px; color: #c9d1d9; font-size: 14px; resize: vertical;
}

.empty-state input { width: 500px; }

.empty-state button {
  padding: 8px 24px; background: #238636; border: 1px solid #238636;
  border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px;
}

.answer-content {
  margin-bottom: 8px; overflow-y: auto; flex: 1; padding: 0;
}

.answer-content .panel-header { padding: 8px 16px; }
.answer-content .markdown-pane { padding-top: 0; }
```

- [ ] **Step 4:** Write `apps/web/src/components/AppHeader.tsx`

```tsx
import { useRef } from "react";
import { useTree } from "../hooks/useTree";

interface Props { onSettings: () => void; onToggleSidebar: () => void; }

export function AppHeader({ onSettings, onToggleSidebar }: Props) {
  const { importBundle, exportBundle } = useTree();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const input = fileRef.current;
    if (!input?.files?.[0]) return;
    try {
      const text = await input.files[0].text();
      await importBundle(JSON.parse(text));
    } catch (e) { alert("Import failed: " + (e as Error).message); }
  };

  const handleExport = async () => {
    const bundle = await exportBundle();
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "asktree-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <header className="app-header">
      <button onClick={onToggleSidebar}>☰</button>
      <h1>AskTree</h1>
      <button onClick={handleExport}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      <button onClick={onSettings}>Settings</button>
    </header>
  );
}
```

- [ ] **Step 5:** Write `apps/web/src/components/TreeSidebar.tsx`

```tsx
import { useTree } from "../hooks/useTree";
import type { Node } from "@asktree/core";

export function TreeSidebar() {
  const { store, activePath, navigateTo } = useTree();
  const currentId = activePath[activePath.length - 1]?.id;

  const renderNode = (node: Node, depth: number): React.ReactNode => {
    const isActive = node.id === currentId;
    const statusColors = { resolved: "#3fb950", question: "#e2b714" } as const;

    return (
      <div key={node.id}>
        <div
          className={`tree-node ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => navigateTo(node.id)}
        >
          <span className="status-dot" style={{ backgroundColor: statusColors[node.status] }} />
          {node.title.slice(0, 30)}
        </div>
        {node.children.map((edge) => {
          const child = store.getNode(edge.targetNodeId);
          return child ? renderNode(child, depth + 1) : null;
        })}
      </div>
    );
  };

  const root = store.getRoot?.();
  if (!root) return null;

  return (
    <aside className="tree-sidebar">
      <h3>Tree Map</h3>
      {renderNode(root, 0)}
    </aside>
  );
}
```

- [ ] **Step 6:** Write `apps/web/src/components/BreadcrumbBar.tsx`

```tsx
import { useTree } from "../hooks/useTree";

export function BreadcrumbBar() {
  const { activePath, navigateTo } = useTree();
  if (activePath.length === 0) return null;

  return (
    <div className="breadcrumb-bar">
      <span style={{ color: "#484f58", marginRight: 8 }}>Path:</span>
      {activePath.map((node, i) => (
        <span key={node.id}>
          {i > 0 && <span className="separator"> → </span>}
          <span
            className={`crumb ${i === activePath.length - 1 ? "active" : ""}`}
            onClick={() => navigateTo(node.id)}
          >
            {node.type === "article" ? "📄 " : "❓ "}
            {node.title.slice(0, 40)}
          </span>
        </span>
      ))}
      <span style={{ marginLeft: "auto", color: "#484f58", fontSize: 11 }}>
        depth: {activePath.length - 1}
      </span>
    </div>
  );
}
```

- [ ] **Step 7:** Build and verify

```bash
pnpm --filter @asktree/web build
```

- [ ] **Step 8:** Commit

```bash
git add apps/web/src/
git commit -m "feat: React app shell — TreeProvider, layout, header, sidebar, breadcrumb"
```

---

### Task 10: MarkdownPane + FloatingAskButton + Lib

**Files:** `apps/web/src/lib/markdown.ts`, `apps/web/src/components/MarkdownPane.tsx`, `apps/web/src/components/FloatingAskButton.tsx`, `tests/web/components/MarkdownPane.test.tsx`

- [ ] **Step 1:** Write `apps/web/src/lib/markdown.ts`

```typescript
import { marked } from "marked";
import DOMPurify from "dompurify";

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string);
}
```

- [ ] **Step 2:** Write `apps/web/src/components/FloatingAskButton.tsx`

```tsx
interface Props { text: string; top: number; left: number; onAsk: () => void; }

export function FloatingAskButton({ text, top, left, onAsk }: Props) {
  const displayText = text.length > 25 ? text.slice(0, 25) + "..." : text;
  return (
    <div className="floating-ask" style={{ top: `${top}px`, left: `${left}px` }}
      onClick={(e) => { e.stopPropagation(); onAsk(); }}>
      🔍 Ask about "{displayText}"
    </div>
  );
}
```

- [ ] **Step 3:** Write `apps/web/src/components/MarkdownPane.tsx`

```tsx
import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "../lib/markdown";
import { FloatingAskButton } from "./FloatingAskButton";

interface Props {
  content: string;
  highlights?: Array<{ startPos: number; endPos: number; nodeId: string }>;
  onTextSelected: (text: string, startPos: number, endPos: number) => void;
}

export function MarkdownPane({ content, onTextSelected }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [floatingPos, setFloatingPos] = useState<{ text: string; top: number; left: number } | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ text: string; start: number; end: number } | null>(null);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current?.contains(sel.anchorNode)) {
      setFloatingPos(null);
      setSelectionRange(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text || text.length > 500) { setFloatingPos(null); setSelectionRange(null); return; }

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    setFloatingPos({
      text,
      top: rect.bottom - containerRect.top + 4,
      left: rect.left - containerRect.left + rect.width / 2 - 60,
    });

    const textContent = containerRef.current.textContent || "";
    const start = textContent.indexOf(text);
    const end = start >= 0 ? start + text.length : 0;
    setSelectionRange({ text, start, end });
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [handleSelection]);

  const handleAsk = () => {
    if (selectionRange) {
      onTextSelected(selectionRange.text, selectionRange.start, selectionRange.end);
      setFloatingPos(null);
      setSelectionRange(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const html = renderMarkdown(content);

  return (
    <div className="markdown-pane" ref={containerRef}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {floatingPos && (
        <FloatingAskButton text={floatingPos.text} top={floatingPos.top} left={floatingPos.left} onAsk={handleAsk} />
      )}
    </div>
  );
}
```

- [ ] **Step 4:** Write `tests/web/components/MarkdownPane.test.tsx`

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownPane } from "../../apps/web/src/components/MarkdownPane";

describe("MarkdownPane", () => {
  it("should render markdown content as HTML", () => {
    const { container } = render(<MarkdownPane content="# Hello World" onTextSelected={() => {}} />);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Hello World");
  });

  it("should render paragraphs", () => {
    const { container } = render(<MarkdownPane content="This is a paragraph." onTextSelected={() => {}} />);
    expect(container.querySelector("p")).toBeTruthy();
  });
});
```

- [ ] **Step 5:** Run tests — expect PASS

- [ ] **Step 6:** Commit

```bash
git add apps/web/src/lib/ apps/web/src/components/MarkdownPane.tsx apps/web/src/components/FloatingAskButton.tsx tests/web/components/
git commit -m "feat: MarkdownPane with text selection + FloatingAskButton + markdown lib"
```

---

### Task 11: QuestionInputBar

**Files:** `apps/web/src/components/QuestionInputBar.tsx`

- [ ] **Step 1:** Write component

```tsx
import { useState } from "react";

interface Props { contextText: string | null; onSend: (question: string) => void; isLoading: boolean; }

export function QuestionInputBar({ contextText, onSend, isLoading }: Props) {
  const [question, setQuestion] = useState("");

  const handleSend = () => {
    if (!question.trim() || isLoading) return;
    onSend(question.trim());
    setQuestion("");
  };

  return (
    <div className="question-input-bar">
      {contextText ? (
        <span className="context-badge" title={contextText}>
          "{contextText.slice(0, 30)}{contextText.length > 30 ? "..." : ""}"
        </span>
      ) : (
        <span style={{ fontSize: 12, color: "#484f58", flexShrink: 0 }}>Free ask</span>
      )}
      <input
        type="text"
        placeholder={contextText ? `About "${contextText.slice(0, 30)}"...` : "Ask anything..."}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        disabled={isLoading}
      />
      <button onClick={handleSend} disabled={isLoading || !question.trim()}>
        {isLoading ? "..." : "Send"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2:** Commit

```bash
git add apps/web/src/components/QuestionInputBar.tsx
git commit -m "feat: QuestionInputBar component"
```

---

### Task 12: DualPanel — Core Interaction

**Files:** `apps/web/src/components/DualPanel.tsx`

- [ ] **Step 1:** Write DualPanel

```tsx
import { useState, useRef } from "react";
import { useTree } from "../hooks/useTree";
import { MarkdownPane } from "./MarkdownPane";
import { QuestionInputBar } from "./QuestionInputBar";
import { collectContext, renderPrompt } from "@asktree/core";

function useContent(store: any, nodeId: string): string | null {
  const [content, setContent] = useState<string | null>(null);
  useState(() => {
    store.getContent(nodeId).then(setContent).catch(() => setContent(""));
  });
  return content;
}

export function DualPanel() {
  const {
    store, llm, activePath, selectedText, setSelectedText,
    addChildNode, promptConfig, createRootTree,
  } = useTree();

  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newArticleRef = useRef<HTMLTextAreaElement>(null);
  const [newTitle, setNewTitle] = useState("");

  const currentNode = activePath[activePath.length - 1];
  const currentNodeContent = currentNode ? useContent(store, currentNode.id) : null;

  // Empty state — no tree yet
  if (!currentNode) {
    return (
      <div className="dual-panel">
        <div className="empty-state">
          <h2>Welcome to AskTree</h2>
          <p>Paste or type a Markdown article to start learning.</p>
          <input
            type="text" placeholder="Article title..." value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ width: 500, padding: "6px 12px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#c9d1d9", fontSize: 14 }}
          />
          <textarea ref={newArticleRef} placeholder="# Your Markdown article here..." />
          <button onClick={async () => {
            const content = newArticleRef.current?.value;
            if (!content) return;
            await createRootTree(content, newTitle || "Untitled");
          }}>Start Learning</button>
        </div>
      </div>
    );
  }

  const handleSendQuestion = async (question: string) => {
    setError(null);
    setIsAsking(true);
    try {
      const slices = await collectContext(currentNode.id, "", store, promptConfig);
      const rendered = renderPrompt(slices, question, promptConfig.template);

      const answer = await llm.ask({ question, contextSlices: slices });

      await addChildNode(currentNode.id, {
        selectedText: selectedText?.text || "",
        startPos: selectedText?.start || 0,
        endPos: selectedText?.end || 0,
        question,
      }, answer);

      setSelectedText(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAsking(false);
    }
  };

  const handleTextSelected = (text: string, start: number, end: number) => {
    if (!currentNode) return;
    setSelectedText({ text, start, end, nodeId: currentNode.id });
  };

  return (
    <div className="dual-panel">
      {/* Left — parent/current reading */}
      <div className="panel">
        <div className="panel-header">
          <span className="node-type">
            {currentNode.type === "article" ? "📄" : "❓"} {currentNode.title.slice(0, 50)}
          </span>
          <select
            value={currentNode.status}
            onChange={(e) => { store.updateStatus(currentNode.id, e.target.value as any); }}
            style={{ fontSize: 11, background: "#21262d", border: "1px solid #30363d", borderRadius: 4, color: "#c9d1d9", padding: "1px 4px" }}
          >
            <option value="question">question</option>
            <option value="resolved">resolved</option>
          </select>
        </div>
        {currentNodeContent !== null && (
          <MarkdownPane
            content={currentNodeContent}
            onTextSelected={handleTextSelected}
          />
        )}
      </div>

      {/* Right — Q&A + input */}
      <div className="panel">
        <div className="empty-state" style={{ flex: 1 }}>
          <p>Select text in the article and click the floating button to ask a question.</p>
          <p style={{ fontSize: 12, color: "#484f58" }}>Or use the input bar below for free-form questions.</p>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", background: "#f8514920", color: "#f85149", fontSize: 12 }}>
            Error: {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#f85149", cursor: "pointer" }}>Dismiss</button>
          </div>
        )}

        <QuestionInputBar
          contextText={selectedText?.text || null}
          onSend={handleSendQuestion}
          isLoading={isAsking}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Commit

```bash
git add apps/web/src/components/DualPanel.tsx
git commit -m "feat: DualPanel — core interaction flow (select → ask → answer)"
```

---

### Task 13: SettingsModal

**Files:** `apps/web/src/components/SettingsModal.tsx`

- [ ] **Step 1:** Write component

```tsx
import { useState } from "react";
import { useTree } from "../hooks/useTree";
import { DEFAULT_PROMPT_CONFIG } from "@asktree/core";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { llm, promptConfig, setPromptConfig } = useTree();
  const [endpoint, setEndpoint] = useState(llm.getConfig()?.endpoint || "http://localhost:11434");
  const [apiKey, setApiKey] = useState(llm.getConfig()?.apiKey || "");
  const [model, setModel] = useState(llm.getConfig()?.model || "llama3");
  const [provider, setProvider] = useState<"ollama" | "openai">("ollama");
  const [maxDepth, setMaxDepth] = useState(promptConfig.maxDepth);
  const [contextRadius, setContextRadius] = useState(promptConfig.contextRadius.join(", "));
  const [template, setTemplate] = useState(promptConfig.template);

  const handleSave = () => {
    llm.configure({ endpoint, apiKey: apiKey || undefined, model }, provider);
    setPromptConfig({
      maxDepth,
      contextRadius: contextRadius.split(",").map((s) => parseInt(s.trim()) || 0),
      template,
    });
    onClose();
  };

  const handleReset = () => {
    setMaxDepth(DEFAULT_PROMPT_CONFIG.maxDepth);
    setContextRadius(DEFAULT_PROMPT_CONFIG.contextRadius.join(", "));
    setTemplate(DEFAULT_PROMPT_CONFIG.template);
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>LLM Configuration</h3>
        <label>Provider</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI Compatible</option>
        </select>

        <label>Endpoint</label>
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:11434" />

        <label>API Key {provider === "ollama" ? "(optional)" : ""}</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />

        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3" />

        <h3 style={{ fontSize: 14, color: "#8b949e", marginTop: 16 }}>Prompt Configuration</h3>
        <label>Max Ancestor Depth</label>
        <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(parseInt(e.target.value) || 3)} min={1} max={5} />

        <label>Context Radius (chars per depth, comma-separated)</label>
        <input value={contextRadius} onChange={(e) => setContextRadius(e.target.value)} placeholder="200, 100, 50" />

        <label>Prompt Template</label>
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} />

        <div className="btn-row">
          <button onClick={handleReset}>Reset Defaults</button>
          <button className="primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Commit

```bash
git add apps/web/src/components/SettingsModal.tsx
git commit -m "feat: SettingsModal — LLM config + prompt template"
```

---

### Task 14: Final Integration — Run & Verify

- [ ] **Step 1:** Lint check

```bash
pnpm lint
```
Expected: No errors

- [ ] **Step 2:** Run all tests

```bash
pnpm test
```
Expected: All tests PASS

- [ ] **Step 3:** Build for production

```bash
pnpm build
```
Expected: Both core and web build succeed

- [ ] **Step 4:** Dev server test

```bash
pnpm dev
```
Expected: Vite dev server starts, open http://localhost:5173

- [ ] **Step 5:** Commit final adjustments

```bash
git add .
git commit -m "chore: final integration, lint, build verify"
```
