# Forest (Multiple Documents) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one AskTree instance hold many independent documents (a forest), selected from the sidebar, with per-document import/export/rename/delete.

**Architecture:** Metadata moves from one fixed storage key to a `forest_meta` index plus one `tree:<treeId>` entry per document. A new `ForestStore` in `@asktree/core` owns the index and a `TreeStore` per document; node contents stay keyed by node id. The web sidebar renders the forest; the dual-panel view always shows the active document.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest + Testing Library, React 18, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-09-25-forest-multi-document-design.md`

## Global Constraints

- There is **no migration** from the old single-tree layout. Do not add code that reads or cleans the legacy `tree_meta` key.
- `ExportBundle` shape stays `{ version: 1, tree, contents }`; files exported by v0.2.0 must still import.
- Import **always** assigns a new `treeId` and remaps every node/edge id; imports never overwrite.
- `TreeSidebar` copy uses the word **Documents**.
- No new runtime dependencies. (`@playwright/test` is a dev dependency added in Task 6.)
- End-to-end behavior is verified in a real browser with Playwright (`pnpm test:e2e`), in addition to unit tests.
- Run from the repo root `/home/whj/Repo/askTree`. Node is via `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- Tests live in `tests/core/` (core) and `apps/web/src/**/__tests__/` (web).

---

## File Structure

- `packages/core/src/types.ts` — add `ForestIndex`, `TreeSummary` (modify)
- `packages/core/src/storage-adapter.ts` — keyed per-tree meta + forest index (modify)
- `packages/core/src/tree-store.ts` — `treeId`, keyed persist, `renameRoot`, drop `reset`/`importBundle` (modify)
- `packages/core/src/forest-store.ts` — new: the forest (create)
- `packages/core/src/index.ts` — exports (modify)
- `apps/web/src/storage/indexeddb-adapter.ts` — implement the new interface (modify)
- `apps/web/src/hooks/useTree.tsx` — forest-aware context (modify)
- `apps/web/src/components/TreeSidebar.tsx` — forest view (modify)
- `apps/web/src/components/AppHeader.tsx` — forest header actions (modify)
- `apps/web/src/components/DualPanel.tsx`, `PromptDebugModal.tsx`, `SettingsModal.tsx` — nullable `store` + renamed API (modify)
- `apps/web/src/App.css` — document row styles (modify)
- `tests/core/tree-store.test.ts`, `tests/core/forest-store.test.ts` (new), `apps/web/src/storage/__tests__/indexeddb-adapter.test.ts`, `apps/web/src/hooks/__tests__/useTree.test.tsx` (new), `apps/web/src/components/__tests__/TreeSidebar.test.tsx` (new), `.../AppHeader.test.tsx`, `.../DualPanel.test.tsx`, `.../PromptDebugModal.test.tsx`, `.../SettingsModal.test.tsx`

---

### Task 1: Per-tree keyed storage

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/storage-adapter.ts`
- Modify: `packages/core/src/tree-store.ts`
- Modify: `apps/web/src/storage/indexeddb-adapter.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `tests/core/tree-store.test.ts`
- Modify: `apps/web/src/storage/__tests__/indexeddb-adapter.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `interface ForestIndex { version: 1; activeTreeId: string | null; trees: string[] }`
  - `interface TreeSummary { id: string; title: string; updatedAt: number }`
  - `StorageAdapter.readForestIndex(): Promise<ForestIndex | null>`
  - `StorageAdapter.writeForestIndex(index: ForestIndex): Promise<void>`
  - `StorageAdapter.readTreeMeta(treeId: string): Promise<TreeJSON | null>`
  - `StorageAdapter.writeTreeMeta(treeId: string, json: TreeJSON): Promise<void>`
  - `StorageAdapter.deleteTreeMeta(treeId: string): Promise<void>`
  - `new TreeStore(adapter, treeId?)`, `TreeStore.treeId: string`
  - `TreeStore.renameRoot(title: string): Promise<void>`
  - `TreeStore.deserialize(json, adapter, treeId?)`

- [ ] **Step 1: Add the forest types**

In `packages/core/src/types.ts`, after `TreeJSON`:

```ts
export interface ForestIndex {
  version: 1;
  activeTreeId: string | null;
  trees: string[];
}

export interface TreeSummary {
  id: string;
  title: string;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing adapter tests**

Replace the `"should write and read tree meta"` and `"should clear all data"` tests in `apps/web/src/storage/__tests__/indexeddb-adapter.test.ts`:

```ts
import type { ForestIndex } from "@asktree/core";

it("should write and read the forest index", async () => {
  const adapter = new IndexedDBStorageAdapter();
  const index: ForestIndex = { version: 1, activeTreeId: "t1", trees: ["t1"] };
  await adapter.writeForestIndex(index);
  expect(await adapter.readForestIndex()).toEqual(index);
});

it("should write, read and delete per-tree meta", async () => {
  const adapter = new IndexedDBStorageAdapter();
  const json = { version: 1 as const, rootNodeId: "r", nodes: {}, createdAt: 0, updatedAt: 0 };
  await adapter.writeTreeMeta("t1", json);
  expect((await adapter.readTreeMeta("t1"))?.rootNodeId).toBe("r");
  expect(await adapter.readTreeMeta("t2")).toBeNull();
  await adapter.deleteTreeMeta("t1");
  expect(await adapter.readTreeMeta("t1")).toBeNull();
});

it("should clear all data", async () => {
  const adapter = new IndexedDBStorageAdapter();
  await adapter.writeNodeContent("a", "a");
  await adapter.writeForestIndex({ version: 1, activeTreeId: null, trees: [] });
  await adapter.clear();
  expect(await adapter.listNodeIds()).toHaveLength(0);
  expect(await adapter.readForestIndex()).toBeNull();
});
```

- [ ] **Step 3: Update the TreeStore tests**

In `tests/core/tree-store.test.ts`, give each store an explicit `treeId` and replace the removed APIs. Change the setup to:

```ts
const adapter = new InMemoryStorageAdapter();
store = new TreeStore(adapter, "tree-1");
```

Update the `deserialize` test to pass a tree id and assert persistence under the new key:

```ts
it("should restore a tree from JSON", async () => {
  const root = await store.createTree("r", "Root");
  const child = await store.addChild(root.id, { selectedText: "x", startPos: 0, endPos: 1, question: "q?" }, "child");
  const json = store.serialize();
  const adapter2 = new InMemoryStorageAdapter();
  const store2 = await TreeStore.deserialize(json, adapter2, "tree-2");
  expect(store2.getRoot().title).toBe("Root");
  expect(store2.getNode(child.id)!.title).toBe("q?");
  expect(store2.treeId).toBe("tree-2");
});

it("persists under its own tree id", async () => {
  await store.createTree("r", "Root");
  expect((await adapter.readTreeMeta("tree-1"))?.rootNodeId).toBe(store.getRoot().id);
  expect(await adapter.readTreeMeta("other")).toBeNull();
});
```

Add a rename test:

```ts
describe("renameRoot", () => {
  it("renames the document title and persists it", async () => {
    await store.createTree("r", "Old");
    await store.renameRoot("New");
    expect(store.getRoot().title).toBe("New");
    expect((await adapter.readTreeMeta("tree-1"))!.nodes[store.getRoot().id].title).toBe("New");
  });
});
```

Delete the old `"export / import"` block — import moves to `ForestStore` in Task 3.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test tests/core/tree-store.test.ts apps/web/src/storage/__tests__/indexeddb-adapter.test.ts`
Expected: FAIL — `writeForestIndex is not a function`, `readTreeMeta` takes an argument, `renameRoot is not a function`.

- [ ] **Step 5: Rewrite the StorageAdapter interface**

Replace `packages/core/src/storage-adapter.ts` entirely:

```ts
import type { TreeJSON, ForestIndex } from "./types";

export interface StorageAdapter {
  readNodeContent(nodeId: string): Promise<string>;
  writeNodeContent(nodeId: string, content: string): Promise<void>;
  deleteNodeContent(nodeId: string): Promise<void>;
  listNodeIds(): Promise<string[]>;
  readForestIndex(): Promise<ForestIndex | null>;
  writeForestIndex(index: ForestIndex): Promise<void>;
  readTreeMeta(treeId: string): Promise<TreeJSON | null>;
  writeTreeMeta(treeId: string, json: TreeJSON): Promise<void>;
  deleteTreeMeta(treeId: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private contents = new Map<string, string>();
  private metas = new Map<string, TreeJSON>();
  private forest: ForestIndex | null = null;

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

  async listNodeIds(): Promise<string[]> {
    return Array.from(this.contents.keys());
  }

  async readForestIndex(): Promise<ForestIndex | null> {
    return this.forest ? { ...this.forest, trees: [...this.forest.trees] } : null;
  }

  async writeForestIndex(index: ForestIndex): Promise<void> {
    this.forest = { ...index, trees: [...index.trees] };
  }

  async readTreeMeta(treeId: string): Promise<TreeJSON | null> {
    return this.metas.get(treeId) ?? null;
  }

  async writeTreeMeta(treeId: string, json: TreeJSON): Promise<void> {
    this.metas.set(treeId, json);
  }

  async deleteTreeMeta(treeId: string): Promise<void> {
    this.metas.delete(treeId);
  }

  async clear(): Promise<void> {
    this.contents.clear();
    this.metas.clear();
    this.forest = null;
  }
}
```

- [ ] **Step 6: Update the IndexedDB adapter**

In `apps/web/src/storage/indexeddb-adapter.ts`, keep the DB setup (object stores `node_contents` and `meta`, `DB_VERSION = 1`) and replace the meta methods. Replace the `META_KEY` constant with:

```ts
const FOREST_KEY = "forest_meta";
const TREE_PREFIX = "tree:";
```

Replace `readTreeMeta`/`writeTreeMeta` with:

```ts
async readForestIndex(): Promise<ForestIndex | null> {
  const db = await this.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(FOREST_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async writeForestIndex(index: ForestIndex): Promise<void> {
  const db = await this.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(index, FOREST_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async readTreeMeta(treeId: string): Promise<TreeJSON | null> {
  const db = await this.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(TREE_PREFIX + treeId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async writeTreeMeta(treeId: string, json: TreeJSON): Promise<void> {
  const db = await this.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(json, TREE_PREFIX + treeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async deleteTreeMeta(treeId: string): Promise<void> {
  const db = await this.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).delete(TREE_PREFIX + treeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

Update the import to `import type { StorageAdapter, TreeJSON, ForestIndex } from "@asktree/core";`.

- [ ] **Step 7: Update TreeStore**

In `packages/core/src/tree-store.ts`:

```ts
constructor(
  private adapter: StorageAdapter,
  readonly treeId: string = crypto.randomUUID(),
) {}
```

`persist()`:

```ts
private async persist(): Promise<void> {
  await this.adapter.writeTreeMeta(this.treeId, this.serialize());
}
```

`deserialize` signature:

```ts
static async deserialize(
  json: TreeJSON,
  adapter: StorageAdapter,
  treeId: string = crypto.randomUUID(),
): Promise<TreeStore> {
  const store = new TreeStore(adapter, treeId);
  // ...unchanged body...
}
```

Add after `getRoot`:

```ts
async renameRoot(title: string): Promise<void> {
  if (!this.rootNodeId) throw new Error("No tree exists");
  const root = this.nodes.get(this.rootNodeId)!;
  root.title = title;
  await this.persist();
}
```

Delete `reset()` (it called `adapter.clear()`, which would now wipe every document) and delete `static async importBundle(...)`.

- [ ] **Step 8: Export the new types**

In `packages/core/src/index.ts`:

```ts
export type { Node, Edge, TreeJSON, ExportBundle, LLMConfig, ContextSlice, AskOptions, PromptConfig, ForestIndex, TreeSummary } from "./types";
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm test tests/core/tree-store.test.ts apps/web/src/storage/__tests__/indexeddb-adapter.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/storage-adapter.ts packages/core/src/tree-store.ts packages/core/src/index.ts apps/web/src/storage/indexeddb-adapter.ts tests/core/tree-store.test.ts apps/web/src/storage/__tests__/indexeddb-adapter.test.ts
git commit -m "Store many trees by key with a forest index"
```

---

### Task 2: ForestStore basics

**Files:**
- Create: `packages/core/src/forest-store.ts`
- Modify: `packages/core/src/index.ts`
- Create: `tests/core/forest-store.test.ts`

**Interfaces:**
- Consumes: Task 1's `ForestIndex`, `TreeSummary`, `StorageAdapter`, `TreeStore`.
- Produces:
  - `ForestStore.load(adapter): Promise<ForestStore>`
  - `listTrees(): TreeSummary[]`, `getActiveTreeId(): string | null`, `getActiveTree(): TreeStore | null`, `getTree(id): TreeStore`
  - `setActiveTree(id: string | null): Promise<void>`
  - `createTree(content, title): Promise<Node>`
  - `renameTree(id, title): Promise<void>`
  - `deleteTree(id): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/forest-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ForestStore, InMemoryStorageAdapter } from "@asktree/core";

describe("ForestStore", () => {
  let adapter: InMemoryStorageAdapter;
  let forest: ForestStore;

  beforeEach(async () => {
    adapter = new InMemoryStorageAdapter();
    forest = await ForestStore.load(adapter);
  });

  it("starts empty", () => {
    expect(forest.listTrees()).toEqual([]);
    expect(forest.getActiveTreeId()).toBeNull();
    expect(forest.getActiveTree()).toBeNull();
  });

  it("creates a document, activates it, and lists it", async () => {
    const root = await forest.createTree("# A", "Alpha");
    expect(forest.getActiveTreeId()).toBe(forest.listTrees()[0].id);
    expect(forest.getActiveTree()!.getRoot().id).toBe(root.id);
    expect(forest.listTrees()).toEqual([
      expect.objectContaining({ title: "Alpha" }),
    ]);
  });

  it("keeps two documents independent", async () => {
    await forest.createTree("a", "Alpha");
    const betaRoot = await forest.createTree("b", "Beta");
    const alphaId = forest.listTrees()[0].id;
    const betaId = forest.listTrees()[1].id;

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Alpha", "Beta"]);
    expect(forest.getActiveTreeId()).toBe(betaId);
    expect(forest.getTree(betaId).getRoot().id).toBe(betaRoot.id);
    expect(forest.getTree(alphaId).getRoot().title).toBe("Alpha");
  });

  it("persists the active document across load", async () => {
    await forest.createTree("a", "Alpha");
    await forest.createTree("b", "Beta");
    await forest.setActiveTree(forest.listTrees()[0].id);

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.getActiveTreeId()).toBe(reloaded.listTrees()[0].id);
    expect(reloaded.listTrees().map((t) => t.title)).toEqual(["Alpha", "Beta"]);
  });

  it("renames a document", async () => {
    await forest.createTree("a", "Alpha");
    await forest.renameTree(forest.listTrees()[0].id, "Renamed");
    expect(forest.listTrees()[0].title).toBe("Renamed");

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()[0].title).toBe("Renamed");
  });

  it("deletes a document with its node contents", async () => {
    const root = await forest.createTree("a", "Alpha");
    await forest.createTree("b", "Beta");
    const alphaId = forest.listTrees()[0].id;

    await forest.deleteTree(alphaId);

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Beta"]);
    expect(forest.getActiveTreeId()).toBe(forest.listTrees()[0].id);
    await expect(adapter.readNodeContent(root.id)).rejects.toThrow();
    expect(await adapter.readTreeMeta(alphaId)).toBeNull();
  });

  it("returns to no active document after deleting the last one", async () => {
    await forest.createTree("a", "Alpha");
    await forest.deleteTree(forest.listTrees()[0].id);
    expect(forest.listTrees()).toEqual([]);
    expect(forest.getActiveTreeId()).toBeNull();
    expect(forest.getActiveTree()).toBeNull();
  });

  it("skips index entries whose tree data is missing", async () => {
    await forest.createTree("a", "Alpha");
    await adapter.writeForestIndex({ version: 1, activeTreeId: "ghost", trees: ["ghost"] });
    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()).toEqual([]);
    expect(reloaded.getActiveTree()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: FAIL — cannot resolve `ForestStore` from `@asktree/core`.

- [ ] **Step 3: Implement ForestStore (without import yet)**

Create `packages/core/src/forest-store.ts`:

```ts
import type { Node, ExportBundle, ForestIndex, TreeSummary } from "./types";
import type { StorageAdapter } from "./storage-adapter";
import { TreeStore } from "./tree-store";

export class ForestStore {
  private index: ForestIndex;
  private trees: Map<string, TreeStore> = new Map();

  private constructor(
    private adapter: StorageAdapter,
    index: ForestIndex,
  ) {
    this.index = index;
  }

  static async load(adapter: StorageAdapter): Promise<ForestStore> {
    const index =
      (await adapter.readForestIndex()) ?? { version: 1, activeTreeId: null, trees: [] };
    const forest = new ForestStore(adapter, index);
    for (const treeId of index.trees) {
      const json = await adapter.readTreeMeta(treeId);
      if (!json) continue; // dangling index entry — skip it
      forest.trees.set(treeId, await TreeStore.deserialize(json, adapter, treeId));
    }
    return forest;
  }

  listTrees(): TreeSummary[] {
    const summaries: TreeSummary[] = [];
    for (const id of this.index.trees) {
      const store = this.trees.get(id);
      if (!store) continue;
      try {
        summaries.push({
          id,
          title: store.getRoot().title,
          updatedAt: store.serialize().updatedAt,
        });
      } catch {
        // tree has no root — skip
      }
    }
    return summaries;
  }

  getActiveTreeId(): string | null {
    return this.index.activeTreeId;
  }

  getActiveTree(): TreeStore | null {
    const id = this.index.activeTreeId;
    return id ? this.trees.get(id) ?? null : null;
  }

  getTree(id: string): TreeStore {
    const store = this.trees.get(id);
    if (!store) throw new Error(`Tree not found: ${id}`);
    return store;
  }

  async setActiveTree(id: string | null): Promise<void> {
    if (id !== null && !this.trees.has(id)) throw new Error(`Tree not found: ${id}`);
    await this.persistIndex({ trees: this.index.trees, activeTreeId: id });
  }

  async createTree(content: string, title: string): Promise<Node> {
    const treeId = crypto.randomUUID();
    const store = new TreeStore(this.adapter, treeId);
    const root = await store.createTree(content, title);
    this.trees.set(treeId, store);
    await this.persistIndex({
      trees: [...this.index.trees, treeId],
      activeTreeId: treeId,
    });
    return root;
  }

  async renameTree(id: string, title: string): Promise<void> {
    await this.getTree(id).renameRoot(title);
  }

  async deleteTree(id: string): Promise<void> {
    const store = this.trees.get(id);
    if (!store) return;
    for (const node of store.getAllNodes()) {
      await this.adapter.deleteNodeContent(node.id).catch(() => {});
    }
    await this.adapter.deleteTreeMeta(id);
    this.trees.delete(id);
    const remaining = this.index.trees.filter((t) => t !== id);
    const activeTreeId =
      this.index.activeTreeId === id ? remaining[0] ?? null : this.index.activeTreeId;
    await this.persistIndex({ trees: remaining, activeTreeId });
  }

  private async persistIndex(next: {
    trees: string[];
    activeTreeId: string | null;
  }): Promise<void> {
    this.index = { version: 1, ...next };
    await this.adapter.writeForestIndex(this.index);
  }
}
```

- [ ] **Step 4: Export ForestStore**

In `packages/core/src/index.ts`:

```ts
export { ForestStore } from "./forest-store";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/forest-store.ts packages/core/src/index.ts tests/core/forest-store.test.ts
git commit -m "Add ForestStore for multiple independent documents"
```

---

### Task 3: Import with id remapping, and per-document export

**Files:**
- Modify: `packages/core/src/forest-store.ts`
- Modify: `tests/core/forest-store.test.ts`

**Interfaces:**
- Consumes: Task 2's `ForestStore`, `TreeStore.exportBundle()`.
- Produces: `importBundle(bundle: ExportBundle): Promise<string>` (returns the new tree id), `exportTree(id: string): Promise<ExportBundle>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/forest-store.test.ts`:

```ts
describe("ForestStore import / export", () => {
  it("imports a bundle as a new independent document with fresh ids", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    const root = await forest.createTree("root md", "Root");
    const child = await forest.getActiveTree()!.addChild(
      root.id,
      { selectedText: "x", startPos: 0, endPos: 1, question: "q?" },
      "child md",
    );
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    expect(bundle.contents[root.id]).toBe("root md");

    const newTreeId = await forest.importBundle(bundle);

    expect(forest.listTrees().map((t) => t.title)).toEqual(["Root", "Root"]);
    expect(forest.getActiveTreeId()).toBe(newTreeId);
    const imported = forest.getTree(newTreeId);
    expect(imported.getRoot().id).not.toBe(root.id);
    const importedRoot = imported.getRoot();
    const importedChild = imported.getNode(importedRoot.children[0].targetNodeId)!;
    expect(importedChild.id).not.toBe(child.id);
    expect(await imported.getContent(importedRoot.id)).toBe("root md");
    expect(await imported.getContent(importedChild.id)).toBe("child md");
  });

  it("keeps the original untouched and survives a reload", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("original", "Doc");
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    await forest.importBundle(bundle);

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees()).toHaveLength(2);
    const [a, b] = reloaded.listTrees().map((t) => t.id);
    expect(await reloaded.getTree(a).getContent(reloaded.getTree(a).getRoot().id)).toBe("original");
    expect(await reloaded.getTree(b).getContent(reloaded.getTree(b).getRoot().id)).toBe("original");
  });

  it("round-trips reading positions through import", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Doc");
    const source = forest.getActiveTree()!;
    source.setReadingPosition(source.getRoot().id, 0.5);
    const bundle = await forest.exportTree(forest.listTrees()[0].id);

    const newTreeId = await forest.importBundle(bundle);
    const importedRoot = forest.getTree(newTreeId).getRoot();
    expect(forest.getTree(newTreeId).getReadingPosition(importedRoot.id)).toBe(0.5);
  });

  it("rejects a malformed bundle without changing the forest", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Doc");

    await expect(
      forest.importBundle({ version: 1, tree: { version: 1, rootNodeId: "missing", nodes: {}, createdAt: 0, updatedAt: 0 }, contents: {} } as never),
    ).rejects.toThrow("Invalid tree bundle");
    expect(forest.listTrees()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: FAIL — `forest.importBundle is not a function`.

- [ ] **Step 3: Implement import and export**

Add to `ForestStore`:

```ts
async exportTree(id: string): Promise<ExportBundle> {
  return this.getTree(id).exportBundle();
}

async importBundle(bundle: ExportBundle): Promise<string> {
  const nodes = bundle?.tree?.nodes;
  if (!nodes || !bundle.tree.rootNodeId || !nodes[bundle.tree.rootNodeId]) {
    throw new Error("Invalid tree bundle");
  }

  const idMap = new Map<string, string>();
  for (const oldId of Object.keys(nodes)) idMap.set(oldId, crypto.randomUUID());

  const remap = (oldId: string): string => {
    const mapped = idMap.get(oldId);
    if (!mapped) throw new Error("Invalid tree bundle");
    return mapped;
  };

  const remappedNodes: Record<string, Node> = {};
  for (const [oldId, node] of Object.entries(nodes)) {
    remappedNodes[remap(oldId)] = {
      ...node,
      id: remap(oldId),
      parentId: node.parentId ? remap(node.parentId) : null,
      children: node.children.map((edge) => ({
        ...edge,
        id: crypto.randomUUID(),
        sourceNodeId: remap(edge.sourceNodeId),
        targetNodeId: remap(edge.targetNodeId),
      })),
    };
  }

  const readingPositions: Record<string, number> = {};
  for (const [oldId, fraction] of Object.entries(bundle.tree.readingPositions ?? {})) {
    if (idMap.has(oldId)) readingPositions[idMap.get(oldId)!] = fraction;
  }

  const json: TreeJSON = {
    version: 1,
    rootNodeId: remap(bundle.tree.rootNodeId),
    nodes: remappedNodes,
    createdAt: bundle.tree.createdAt,
    updatedAt: Date.now(),
    ...(Object.keys(readingPositions).length > 0 ? { readingPositions } : {}),
  };

  const treeId = crypto.randomUUID();
  await this.adapter.writeTreeMeta(treeId, json);
  for (const [oldId, content] of Object.entries(bundle.contents ?? {})) {
    if (idMap.has(oldId)) await this.adapter.writeNodeContent(idMap.get(oldId)!, content);
  }

  this.trees.set(treeId, await TreeStore.deserialize(json, this.adapter, treeId));
  await this.persistIndex({
    trees: [...this.index.trees, treeId],
    activeTreeId: treeId,
  });
  return treeId;
}
```

Add `TreeJSON` to the type import at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/forest-store.ts tests/core/forest-store.test.ts
git commit -m "Import bundles as new documents with remapped ids"
```

---

### Task 4: Forest-aware context and consumers

**Files:**
- Modify: `apps/web/src/hooks/useTree.tsx`
- Modify: `apps/web/src/components/DualPanel.tsx`
- Modify: `apps/web/src/components/AppHeader.tsx`
- Modify: `apps/web/src/components/TreeSidebar.tsx`
- Modify: `apps/web/src/components/PromptDebugModal.tsx`
- Modify: `apps/web/src/components/SettingsModal.tsx`
- Create: `apps/web/src/hooks/__tests__/useTree.test.tsx`
- Modify: `apps/web/src/components/__tests__/AppHeader.test.tsx`, `DualPanel.test.tsx`, `PromptDebugModal.test.tsx`, `SettingsModal.test.tsx`

**Interfaces:**
- Consumes: `ForestStore` from Task 2/3.
- Produces (context): `store: TreeStore | null`, `trees: TreeSummary[]`, `activeTreeId: string | null`, `setActiveTree(id)`, `createDocument(content, title)`, `deleteDocument(id)`, `renameDocument(id, title)`, `exportDocument(id): Promise<ExportBundle | null>`, `importDocument(bundle)`; `activePath`, `navigateTo`, `navigateUp`, `focusNode`, `addChildNode`, `updateStatus`, `removeNode`, `selectedText`, `setSelectedText`, `promptConfig`, `setPromptConfig`, `showExplored`, `setShowExplored`, `treeVersion`, `isLoading`.

- [ ] **Step 1: Write the failing provider test**

Create `apps/web/src/hooks/__tests__/useTree.test.tsx`:

```tsx
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TreeProvider, useTree } from "../useTree";

function Probe() {
  const { trees, activeTreeId, createDocument, deleteDocument, setActiveTree } = useTree();
  return (
    <div>
      <span data-testid="count">{trees.length}</span>
      <span data-testid="active">{activeTreeId ?? "none"}</span>
      <button onClick={() => createDocument("body", "Doc")}>create</button>
      <button onClick={() => deleteDocument(trees[0].id)}>delete-first</button>
      <button onClick={() => setActiveTree(trees[0].id)}>activate-first</button>
    </div>
  );
}

describe("useTree forest context", () => {
  it("creates, activates and deletes documents", async () => {
    render(<TreeProvider><Probe /></TreeProvider>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));

    fireEvent.click(screen.getByText("create"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(screen.getByTestId("active").textContent).not.toBe("none");

    fireEvent.click(screen.getByText("delete-first"));
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("0"));
    expect(screen.getByTestId("active").textContent).toBe("none");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test apps/web/src/hooks/__tests__/useTree.test.tsx`
Expected: FAIL — `createDocument is not a function` (context still exposes `createRootTree`).

- [ ] **Step 3: Rewrite the provider**

Replace the body of `apps/web/src/hooks/useTree.tsx`. Keep the `promptConfig` and `showExplored` localStorage behavior exactly as it is today. The context interface becomes:

```ts
interface TreeContextValue {
  store: TreeStore | null;
  llm: LLMService;
  activePath: Node[];
  trees: TreeSummary[];
  activeTreeId: string | null;
  setActiveTree: (id: string | null) => Promise<void>;
  createDocument: (content: string, title: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  exportDocument: (id: string) => Promise<ExportBundle | null>;
  importDocument: (bundle: ExportBundle) => Promise<void>;
  navigateTo: (nodeId: string) => void;
  navigateUp: () => void;
  focusNode: (nodeId: string) => void;
  addChildNode: (parentId: string, edge: Omit<Edge, "id" | "sourceNodeId" | "targetNodeId">, answerContent: string) => Promise<Node>;
  updateStatus: (nodeId: string, status: Node["status"]) => void;
  removeNode: (nodeId: string) => Promise<void>;
  selectedText: { text: string; start: number; end: number; nodeId: string } | null;
  setSelectedText: (s: TreeContextValue["selectedText"]) => void;
  promptConfig: PromptConfig;
  setPromptConfig: (c: PromptConfig) => void;
  showExplored: boolean;
  setShowExplored: (show: boolean) => void;
  treeVersion: number;
  isLoading: boolean;
}
```

Provider internals (imports add `ForestStore`, `TreeSummary`):

```tsx
const adapterRef = useRef(new IndexedDBStorageAdapter());
const forestRef = useRef<ForestStore | null>(null);
const [store, setStore] = useState<TreeStore | null>(null);
const [trees, setTrees] = useState<TreeSummary[]>([]);
const [activeTreeId, setActiveTreeId] = useState<string | null>(null);

const refresh = useCallback((forest: ForestStore) => {
  const active = forest.getActiveTree();
  setTrees(forest.listTrees());
  setActiveTreeId(forest.getActiveTreeId());
  setStore(active);
  setActivePath(active ? [active.getRoot()] : []);
  setTreeVersion((v) => v + 1);
}, []);

useEffect(() => {
  (async () => {
    try {
      const forest = await ForestStore.load(adapterRef.current);
      forestRef.current = forest;
      refresh(forest);
    } catch {}
    setIsLoading(false);
  })();
}, [refresh]);
```

The document operations all follow the same shape:

```tsx
const createDocument = useCallback(async (content: string, title: string) => {
  const forest = forestRef.current;
  if (!forest) return;
  await forest.createTree(content, title);
  setSelectedText(null);
  refresh(forest);
}, [refresh]);

const setActiveTree = useCallback(async (id: string | null) => {
  const forest = forestRef.current;
  if (!forest) return;
  await forest.setActiveTree(id);
  setSelectedText(null);
  refresh(forest);
}, [refresh]);

const deleteDocument = useCallback(async (id: string) => {
  const forest = forestRef.current;
  if (!forest) return;
  await forest.deleteTree(id);
  setSelectedText(null);
  refresh(forest);
}, [refresh]);

const renameDocument = useCallback(async (id: string, title: string) => {
  const forest = forestRef.current;
  if (!forest) return;
  await forest.renameTree(id, title);
  refresh(forest);
}, [refresh]);

const exportDocument = useCallback(async (id: string) => {
  const forest = forestRef.current;
  if (!forest) return null;
  try { return await forest.exportTree(id); } catch { return null; }
}, []);

const importDocument = useCallback(async (bundle: ExportBundle) => {
  const forest = forestRef.current;
  if (!forest) return;
  await forest.importBundle(bundle);
  setSelectedText(null);
  refresh(forest);
}, [refresh]);
```

Node operations read the active tree from the forest:

```tsx
const navigateTo = useCallback((nodeId: string) => {
  const active = forestRef.current?.getActiveTree();
  if (active) setActivePath(active.getPath(nodeId));
}, []);

const focusNode = useCallback((nodeId: string) => {
  const active = forestRef.current?.getActiveTree();
  const node = active?.getNode(nodeId);
  if (node) setActivePath([node]);
}, []);

const addChildNode = useCallback(async (parentId, edge, answerContent) => {
  const active = forestRef.current?.getActiveTree();
  if (!active) throw new Error("No active document");
  const child = await active.addChild(parentId, edge, answerContent);
  setActivePath(active.getPath(child.id));
  setTreeVersion((v) => v + 1);
  return child;
}, []);

const updateStatus = useCallback((nodeId, status) => {
  const active = forestRef.current?.getActiveTree();
  if (!active) return;
  active.updateStatus(nodeId, status);
  setActivePath((prev) => prev.map((n) => (n.id === nodeId ? { ...n, status } : n)));
}, []);

const removeNode = useCallback(async (nodeId) => {
  const active = forestRef.current?.getActiveTree();
  if (!active) return;
  await active.removeNode(nodeId);
  setActivePath((prev) => {
    const idx = prev.findIndex((n) => n.id === nodeId);
    if (idx === -1) return prev;
    const trimmed = prev.slice(0, idx);
    return trimmed.length > 0 ? trimmed : [];
  });
  setTreeVersion((v) => v + 1);
}, []);
```

The provider value passes `store`, `trees`, `activeTreeId` and the new callbacks.

- [ ] **Step 4: Make consumers compile and keep behavior**

- `DualPanel.tsx`: destructure `createDocument` instead of `createRootTree` (call sites at lines ~211 and ~220 become `createDocument`). Guard every `store` use since it is now nullable: `exploredSpans` needs a store — change the two `useMemo` calls to `showExplored && store ? exploredSpans(store, parentNode) : []`; add `if (!parentNode || !store) return;` to the content effect and `if (!currentNode || !store) return;` to the second; in `handleSendQuestion` add `if (!store) return;` at the top; guard the `store.getReadingPosition` reads in JSX with `store?.getReadingPosition(...)`.
- `AppHeader.tsx`: the old context API is gone, so the header switches to forest semantics here. Destructure `{ activeTreeId, trees, createDocument, importDocument, exportDocument }`; remove `handleReset`, the `🧹` button, its `confirmAction` state and the now-unused `ConfirmModal` import; `hasTree` becomes `activeTreeId !== null`. `📂` and `Import Tree` **append** a document (`createDocument` / `importDocument`, no replace confirmation). `Export Tree` exports the active document and is disabled when `activeTreeId === null`:

```tsx
const handleExport = async () => {
  if (!activeTreeId) return;
  const bundle = await exportDocument(activeTreeId);
  if (!bundle) return;
  const json = JSON.stringify(bundle, null, 2);
  const title = trees.find((t) => t.id === activeTreeId)?.title ?? "asktree-tree";
  await saveTextFile(json, {
    suggestedName: `${sanitizeFilename(title)}.json`,
    description: "JSON",
    mimeType: "application/json",
    extensions: [".json"],
  });
};
```

- `TreeSidebar.tsx`: temporary minimal adaptation — drop `resetTree`; derive `root` from `store` (`store ? store.getRoot() : null`); delete-root calls `deleteDocument(root.id)`.
- `PromptDebugModal.tsx` and `SettingsModal.tsx`: guard `store` being null where it is read (`if (!store) return;` / optional chaining); no behavior change.

- [ ] **Step 5: Update the component test mocks**

In `AppHeader.test.tsx`, `DualPanel.test.tsx`, `PromptDebugModal.test.tsx`, `SettingsModal.test.tsx`, update the mocked context objects to the new shape: add `trees`, `activeTreeId`, `setActiveTree`, `createDocument`, `deleteDocument`, `renameDocument`, `exportDocument`, `importDocument`; remove `createRootTree`, `resetTree`, `importBundle`, `exportBundle`. In `DualPanel.test.tsx` the `mocks.ctx` uses `activePath: []` for the empty state — keep that (the empty state still renders when no node is active). Where a test builds a real `TreeStore`, construct it as `new TreeStore(new InMemoryStorageAdapter(), "tree-1")`.

Also add these `AppHeader.test.tsx` cases:

```tsx
it("exports the active document", async () => {
  const exportDocument = vi.fn().mockResolvedValue({ version: 1, tree: {}, contents: {} });
  mocks.ctx = { ...mocks.ctx, activeTreeId: "t1", exportDocument };
  render(<AppHeader onSettings={vi.fn()} onToggleSidebar={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /export tree/i }));
  await waitFor(() => expect(exportDocument).toHaveBeenCalledWith("t1"));
});

it("disables export when no document is active", () => {
  mocks.ctx = { ...mocks.ctx, activeTreeId: null };
  render(<AppHeader onSettings={vi.fn()} onToggleSidebar={vi.fn()} />);
  const button = screen.getByRole("button", { name: /export tree/i }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
});

it("appends an imported document instead of replacing", async () => {
  const importDocument = vi.fn();
  mocks.ctx = { ...mocks.ctx, importDocument };
  const { container } = render(<AppHeader onSettings={vi.fn()} onToggleSidebar={vi.fn()} />);
  const input = container.querySelector('input[accept=".json"]') as HTMLInputElement;
  const file = new File(["{}"], "tree.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve('{"version":1,"tree":{"nodes":{}},"contents":{}}') });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(importDocument).toHaveBeenCalled());
});

it("has no clear button", () => {
  render(<AppHeader onSettings={vi.fn()} onToggleSidebar={vi.fn()} />);
  expect(screen.queryByTitle(/clear current tree/i)).toBeNull();
});
```

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS. Then `pnpm lint` — Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useTree.tsx apps/web/src/hooks/__tests__/useTree.test.tsx apps/web/src/components/DualPanel.tsx apps/web/src/components/AppHeader.tsx apps/web/src/components/TreeSidebar.tsx apps/web/src/components/PromptDebugModal.tsx apps/web/src/components/SettingsModal.tsx apps/web/src/components/__tests__/AppHeader.test.tsx apps/web/src/components/__tests__/DualPanel.test.tsx apps/web/src/components/__tests__/PromptDebugModal.test.tsx apps/web/src/components/__tests__/SettingsModal.test.tsx
git commit -m "Make the tree context forest-aware"
```

---

### Task 5: Sidebar forest UI

**Files:**
- Modify: `apps/web/src/components/TreeSidebar.tsx`
- Modify: `apps/web/src/App.css`
- Create: `apps/web/src/components/__tests__/TreeSidebar.test.tsx`

**Interfaces:**
- Consumes: context from Task 4 (`trees`, `activeTreeId`, `setActiveTree`, `store`, `focusNode`, `removeNode`, `renameDocument`, `exportDocument`, `deleteDocument`, `activePath`).
- Produces: DOM contract — heading `Documents`; a row `[data-testid="doc-row-<id>"]` per document with `aria-label="Toggle <title>"`, `aria-label="Rename <title>"`, `aria-label="Export <title>"`, `aria-label="Delete <title>"`; a `＋ New` button labelled `New document`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/__tests__/TreeSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InMemoryStorageAdapter, TreeStore } from "@asktree/core";
import type { Node } from "@asktree/core";

const mocks = vi.hoisted(() => ({ ctx: {} as Record<string, unknown> }));
vi.mock("../../hooks/useTree", () => ({ useTree: () => mocks.ctx }));

import { TreeSidebar } from "../TreeSidebar";

function makeStore(rootTitle: string): TreeStore {
  const adapter = new InMemoryStorageAdapter();
  const store = new TreeStore(adapter, rootTitle);
  // createTree is async; tests call setupStore() before render instead.
  void store.createTree(`# ${rootTitle}`, rootTitle);
  return store;
}

describe("TreeSidebar (forest)", () => {
  let alpha: TreeStore;
  let beta: TreeStore;

  beforeEach(async () => {
    const adapterA = new InMemoryStorageAdapter();
    alpha = new TreeStore(adapterA, "alpha");
    const alphaRoot = await alpha.createTree("# Alpha", "Alpha");
    await alpha.addChild(alphaRoot.id, { selectedText: "a", startPos: 0, endPos: 1, question: "A child?" }, "answer");

    const adapterB = new InMemoryStorageAdapter();
    beta = new TreeStore(adapterB, "beta");
    await beta.createTree("# Beta", "Beta");

    mocks.ctx = {
      store: alpha,
      trees: [
        { id: "alpha", title: "Alpha", updatedAt: 1 },
        { id: "beta", title: "Beta", updatedAt: 2 },
      ],
      activeTreeId: "alpha",
      setActiveTree: vi.fn(),
      renameDocument: vi.fn(),
      exportDocument: vi.fn(),
      deleteDocument: vi.fn(),
      createDocument: vi.fn(),
      activePath: [alpha.getRoot()] as Node[],
      focusNode: vi.fn(),
      removeNode: vi.fn(),
    };
    void makeStore;
  });

  it("lists every document and highlights the active one", () => {
    render(<TreeSidebar />);
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByTestId("doc-row-alpha").className).toContain("active");
    expect(screen.getByTestId("doc-row-beta").className).not.toContain("active");
  });

  it("shows the document title once, without a duplicate root node", () => {
    render(<TreeSidebar />);
    // The row already represents the root; the subtree must start at its children.
    expect(screen.getAllByText("Alpha")).toHaveLength(1);
  });

  it("switches document when a row is clicked", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByTestId("doc-row-beta"));
    expect(mocks.ctx.setActiveTree).toHaveBeenCalledWith("beta");
  });

  it("expands the active document's subtree by default and collapses on toggle", async () => {
    render(<TreeSidebar />);
    expect(await screen.findByText("A child?")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Toggle Alpha"));
    await waitFor(() => expect(screen.queryByText("A child?")).toBeNull());
  });

  it("renames a document inline", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Rename Beta"));
    const input = screen.getByDisplayValue("Beta");
    fireEvent.change(input, { target: { value: "Beta v2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.ctx.renameDocument).toHaveBeenCalledWith("beta", "Beta v2");
  });

  it("exports a document", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Export Beta"));
    expect(mocks.ctx.exportDocument).toHaveBeenCalledWith("beta");
  });

  it("asks for confirmation before deleting a document", async () => {
    mocks.ctx = {
      ...mocks.ctx,
      deleteDocument: vi.fn(),
    };
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("Delete Beta"));
    const confirm = await screen.findByRole("button", { name: /^delete$/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.ctx.deleteDocument).toHaveBeenCalledWith("beta"));
  });

  it("starts a new document from the New control", () => {
    render(<TreeSidebar />);
    fireEvent.click(screen.getByLabelText("New document"));
    expect(mocks.ctx.setActiveTree).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test apps/web/src/components/__tests__/TreeSidebar.test.tsx`
Expected: FAIL — no `Documents` heading, no `doc-row-*` elements.

- [ ] **Step 3: Implement the forest sidebar**

Rewrite `apps/web/src/components/TreeSidebar.tsx`:

```tsx
import { useCallback, useState } from "react";
import { useTree } from "../hooks/useTree";
import { ConfirmModal } from "./ConfirmModal";
import { saveTextFile } from "../lib/save-file";
import { sanitizeFilename } from "../lib/filename";
import type { Node } from "@asktree/core";

export function TreeSidebar({ style }: { style?: React.CSSProperties }) {
  const {
    store, trees, activeTreeId, setActiveTree, activePath,
    focusNode, removeNode, renameDocument, exportDocument, deleteDocument,
  } = useTree();
  const currentId = activePath[activePath.length - 1]?.id;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const statusColors = { resolved: "#3fb950", question: "#e2b714" } as const;

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const startRename = useCallback((id: string, title: string) => {
    setRenamingId(id);
    setRenameDraft(title);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameDraft.trim()) renameDocument(renamingId, renameDraft.trim());
    setRenamingId(null);
  }, [renamingId, renameDraft, renameDocument]);

  const handleExport = useCallback(async (id: string, title: string) => {
    const bundle = await exportDocument(id);
    if (!bundle) return;
    await saveTextFile(JSON.stringify(bundle, null, 2), {
      suggestedName: `${sanitizeFilename(title)}.json`,
      description: "JSON",
      mimeType: "application/json",
      extensions: [".json"],
    });
  }, [exportDocument]);

  const handleDeleteNode = useCallback((node: Node, rootId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.id === rootId) {
      setConfirmDeleteId(rootId);
      return;
    }
    if (!window.confirm(`Delete "${node.title.slice(0, 40)}" and all its sub-nodes?`)) return;
    removeNode(node.id);
  }, [removeNode]);

  const renderNode = (node: Node, rootId: string, depth: number): React.ReactNode => (
    <div key={node.id}>
      <div
        className={`tree-node ${node.id === currentId ? "active" : ""}`}
        style={{ paddingLeft: `${20 + depth * 12}px` }}
        onClick={() => focusNode(node.id)}
        onContextMenu={(e) => handleDeleteNode(node, rootId, e)}
      >
        <span className="status-dot" style={{ backgroundColor: statusColors[node.status] }} />
        <span title={node.title}>{node.title}</span>
      </div>
      {node.children.map((edge) => {
        const child = store?.getNode(edge.targetNodeId);
        return child ? renderNode(child, rootId, depth + 1) : null;
      })}
    </div>
  );

  if (trees.length === 0) return null;

  const confirmTitle = trees.find((t) => t.id === confirmDeleteId)?.title ?? "";

  return (
    <aside className="tree-sidebar" style={style}>
      <div className="forest-header">
        <h3>Documents</h3>
        <button aria-label="New document" title="New document" onClick={() => setActiveTree(null)}>＋</button>
      </div>

      {trees.map((tree) => {
        const isActive = tree.id === activeTreeId;
        const isCollapsed = collapsed.has(tree.id);
        const activeStore = isActive ? store : null;
        const root = activeStore ? (() => { try { return activeStore.getRoot(); } catch { return null; } })() : null;

        return (
          <div key={tree.id} className="forest-doc">
            <div
              data-testid={`doc-row-${tree.id}`}
              className={`doc-row ${isActive ? "active" : ""}`}
              onClick={() => setActiveTree(tree.id)}
            >
              <button
                className="doc-chevron"
                aria-label={`Toggle ${tree.title}`}
                onClick={(e) => { e.stopPropagation(); toggle(tree.id); }}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>

              {renamingId === tree.id ? (
                <input
                  autoFocus
                  className="doc-rename-input"
                  value={renameDraft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="doc-title" title={tree.title}>{tree.title}</span>
              )}

              <span className="doc-actions">
                <button aria-label={`Rename ${tree.title}`} title="Rename" onClick={(e) => { e.stopPropagation(); startRename(tree.id, tree.title); }}>✎</button>
                <button aria-label={`Export ${tree.title}`} title="Export" onClick={(e) => { e.stopPropagation(); void handleExport(tree.id, tree.title); }}>⭳</button>
                <button aria-label={`Delete ${tree.title}`} title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(tree.id); }}>🗑</button>
              </span>
            </div>

            {!isCollapsed && isActive && root && (
              <div className="forest-tree">
                {root.children.map((edge) => {
                  const child = store?.getNode(edge.targetNodeId);
                  return child ? renderNode(child, tree.id, 0) : null;
                })}
              </div>
            )}
          </div>
        );
      })}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete this document?"
          message={`"${confirmTitle}" and all of its questions will be deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { void deleteDocument(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </aside>
  );
}
```

Note: only the active document loads a `TreeStore`, so nested children render for the active document only — matching the spec ("expanded rows render the existing subtree").

- [ ] **Step 4: Add the styles**

Append to `apps/web/src/App.css`:

```css
.forest-header { display: flex; align-items: center; justify-content: space-between; padding-right: 8px; }
.forest-header button { background: none; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; cursor: pointer; width: 26px; height: 26px; }
.doc-row { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #c9d1d9; }
.doc-row:hover { background: #21262d; }
.doc-row.active { background: #1f6feb22; color: #ffffff; }
.doc-chevron { background: none; border: none; color: inherit; cursor: pointer; width: 16px; padding: 0; }
.doc-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-actions { display: none; gap: 2px; }
.doc-row:hover .doc-actions { display: inline-flex; }
.doc-actions button { background: none; border: none; color: #8b949e; cursor: pointer; padding: 0 2px; }
.doc-actions button:hover { color: #c9d1d9; }
.doc-rename-input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; color: #c9d1d9; font-size: 13px; padding: 1px 4px; }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test apps/web/src/components/__tests__/TreeSidebar.test.tsx`
Expected: PASS. Then `pnpm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/TreeSidebar.tsx apps/web/src/components/__tests__/TreeSidebar.test.tsx apps/web/src/App.css
git commit -m "Show the forest in the sidebar with per-document actions"
```

---

### Task 6: Playwright end-to-end verification

**Files:**
- Modify: `package.json` (root — add the `test:e2e` script and the dev dependency)
- Create: `playwright.config.ts`
- Create: `e2e/forest.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the built web app served by the Vite dev server at `http://localhost:5173/askTree/`; the context API from Task 4; the DOM contract from Task 5 (`.doc-row`, `.doc-row.active`, `.doc-rename-input`, `aria-label="Rename <title>"`, `aria-label="Export <title>"`, `aria-label="Delete <title>"`, `aria-label="Toggle <title>"`); the existing `QuestionInputBar` placeholder `/ask anything/i` and the `Send` button.
- Produces: `pnpm test:e2e` runs headless Chromium against a freshly started dev server.

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D -w @playwright/test
pnpm exec playwright install chromium
```

Note: `playwright install` downloads a browser and needs network access. If it fails in this environment, stop and report the blocker rather than skipping the task.

- [ ] **Step 2: Add the config and ignores**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173/askTree/",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/askTree/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Add to the root `package.json` scripts: `"test:e2e": "playwright test"`.

Add to `.gitignore`: `test-results/` and `playwright-report/`.

- [ ] **Step 3: Write the spec**

Create `e2e/forest.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

const mdInput = (page: Page) => page.locator('header input[accept=".md,.markdown,.txt"]');

async function openDoc(page: Page, name: string, body: string) {
  await mdInput(page).setInputFiles({
    name: `${name}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(body),
  });
}

test("opens multiple documents and highlights the newest", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nfirst article");
  await expect(page.locator(".doc-row")).toHaveCount(1);

  await openDoc(page, "beta", "# Beta\n\nsecond article");
  await expect(page.locator(".doc-row")).toHaveCount(2);
  await expect(page.locator(".doc-row", { hasText: "beta" })).toHaveClass(/active/);
  await expect(page.locator(".doc-row", { hasText: "alpha" })).not.toHaveClass(/active/);
});

test("switches documents without losing their content", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nfirst article");
  await openDoc(page, "beta", "# Beta\n\nsecond article");
  await expect(page.getByText("second article")).toBeVisible();

  await page.locator(".doc-row", { hasText: "alpha" }).click();
  await expect(page.locator(".doc-row", { hasText: "alpha" })).toHaveClass(/active/);
  await expect(page.getByText("first article")).toBeVisible();
});

test("renames a document and persists the name across reload", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");

  const row = page.locator(".doc-row", { hasText: "alpha" });
  await row.hover();
  await row.getByLabel("Rename alpha").click();
  const input = row.locator(".doc-rename-input");
  await input.fill("Renamed");
  await input.press("Enter");

  await expect(page.locator(".doc-row", { hasText: "Renamed" })).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".doc-row", { hasText: "Renamed" })).toHaveCount(1);
});

test("exports the active document and imports it as a new one", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Tree" }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.locator('header input[accept=".json"]').setInputFiles(path!);
  await expect(page.locator(".doc-row")).toHaveCount(2);
});

test("deletes documents, and deleting the last returns to the welcome screen", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");
  await openDoc(page, "beta", "# Beta\n\nbody");

  const beta = page.locator(".doc-row", { hasText: "beta" });
  await beta.hover();
  await beta.getByLabel("Delete beta").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".doc-row")).toHaveCount(1);

  const alpha = page.locator(".doc-row", { hasText: "alpha" });
  await alpha.hover();
  await alpha.getByLabel("Delete alpha").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".doc-row")).toHaveCount(0);
  await expect(page.getByText("Welcome to AskTree")).toBeVisible();
});

test("keeps each document's questions separate", async ({ page }) => {
  // Point the LLM at a same-origin path and intercept it, so no real model is called.
  await page.addInitScript(() => {
    localStorage.setItem(
      "asktree_llm_config",
      JSON.stringify({
        config: { endpoint: "http://localhost:5173/fake-llm", model: "test", apiKey: "x" },
        provider: "openai",
      }),
    );
  });
  await page.route("**/fake-llm/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ choices: [{ message: { content: "STUB ANSWER" } }] }),
    }),
  );

  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nalpha passage");
  await openDoc(page, "beta", "# Beta\n\nbeta passage");

  // Free ask on the active document (beta).
  await page.getByPlaceholder(/ask anything/i).fill("beta question");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText("STUB ANSWER")).toBeVisible();

  // Alpha has no questions; beta keeps its own.
  await page.locator(".doc-row", { hasText: "alpha" }).click();
  await expect(page.locator(".tree-node", { hasText: "beta question" })).toHaveCount(0);
  await page.locator(".doc-row", { hasText: "beta" }).click();
  await expect(page.locator(".tree-node", { hasText: "beta question" })).toHaveCount(1);
});
```

- [ ] **Step 4: Run the suite**

Run: `pnpm test:e2e`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e/forest.spec.ts .gitignore
git commit -m "Add Playwright end-to-end coverage for the forest"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: all test files pass, 0 failures.

- [ ] **Step 2: Type-check and build**

Run: `pnpm lint && pnpm build`
Expected: both exit 0.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`, open `http://localhost:5173/askTree/`, and confirm:
1. Open two Markdown files (`📂` twice) → two rows under **Documents**; the second is highlighted.
2. Click the first row → the dual panel shows the first article; expand/collapse toggles its subtree.
3. Ask a question in document 1, switch to document 2, switch back → document 1 keeps its question and reading position.
4. Rename a document (`✎`), reload the page → the new title persists and the active document is restored.
5. Export document 2, then Import Tree with that file → a third document appears; the original is unchanged.
6. Delete a document (🗑 → confirm) → it disappears; if it was active, a neighbour becomes active.
7. Delete the last document → the welcome screen returns; `＋ New` shows it again without deleting anything.

- [ ] **Step 4: Report**

Summarize pass/fail for steps 1–3 with the observed output. Do not claim completion without the command output.

---

## Self-Review

- **Spec coverage:** forest index + per-tree storage (Task 1); ForestStore list/active/create/rename/delete (Task 2); import remapping + per-document export (Task 3); context + nullable active tree + switch resets `activePath`/`selectedText` + header without `🧹`, export active, import appends, `📂` appends (Task 4); sidebar forest with expand/collapse, rename, export, delete, `＋ New`, `Documents` heading, `＋ New` = clear selection (Task 5); end-to-end browser coverage of the same flows including per-document question isolation (Task 6); duplicate titles and dangling-index handling (Tasks 2/5 tests). No migration anywhere (Global Constraints).
- **Placeholders:** none — every code step carries the code.
- **Type consistency:** `ForestIndex`, `TreeSummary`, `readTreeMeta(treeId)`, `writeTreeMeta(treeId, json)`, `deleteTreeMeta`, `createDocument`, `deleteDocument`, `renameDocument`, `exportDocument`, `importDocument`, `setActiveTree` are used with the same names and arities throughout.
