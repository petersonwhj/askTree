# Forest: Multiple Documents per AskTree

- **Date:** 2026-09-25
- **Status:** Approved for planning
- **Scope:** Turn the single-tree app into a forest of independent documents.

## Goal

Today an AskTree instance holds exactly one tree. This change allows many
independent documents in one instance:

- The sidebar shows a forest: one row per document (its root), each expandable.
- Exactly one document is **active**; the dual-panel view always shows the active
  document. Selecting a row switches the active document.
- **Import** appends a new document; it never overwrites or merges.
- **Export** exports one document, the active one.
- A document can be renamed and deleted.
- All existing behavior (select-to-ask, free ask, math, reading position,
  explored marks, prompt debug) is unchanged and scoped to the active document.

## Non-goals

- Cross-document search, linking, or moving nodes between documents.
- Per-document prompt configuration (prompt config stays global).
- Lazy-loading trees (see Risks).

## Terminology

- **Document / tree:** the unit created from one Markdown article. Its identity is
  a `treeId`; its root node's title is the document title.
- **Active document:** the one shown in the dual-panel view.
- **Forest:** all documents in the instance, plus which one is active.

## Current state

- `TreeStore` owns one tree: a `nodes` map, a `readingPositions` map, and a single
  `rootNodeId`. `persist()` writes `adapter.writeTreeMeta(json)`.
- `StorageAdapter` stores one `TreeJSON` under a fixed key (`tree_meta`) and node
  contents keyed by `nodeId`.
- `useTree` holds a single `storeRef`; `activePath` is the path within that tree.
- `TreeSidebar` renders one root plus its children; right-click on a node deletes
  it (root → `resetTree`).
- `AppHeader` exposes `📂` (load file), `Export Tree`, `Import Tree`, `🧹` (clear),
  `Settings`.

## Data model

A forest index plus one stored tree per document:

```
ForestIndex {
  version: 1
  activeTreeId: string | null
  trees: string[]            // ordered; insertion order = sidebar order
}
```

`TreeJSON` keeps its current shape and `version: 1`; it stores no `treeId` because
the storage key carries it. This keeps export bundles byte-compatible with v0.2.0.

`TreeStore` gains a `treeId` (passed to its constructor) and persists to
`writeTreeMeta(treeId, json)`. Its tree logic is otherwise unchanged.

## Storage

Node contents stay keyed by `nodeId`, unchanged. Only the metadata layout changes:

| Key | Value |
| --- | --- |
| `forest_meta` | `ForestIndex` |
| `tree:<treeId>` | `TreeJSON` |

`StorageAdapter` interface changes:

```ts
// removed
readTreeMeta(): Promise<TreeJSON | null>
writeTreeMeta(json: TreeJSON): Promise<void>

// added
readForestIndex(): Promise<ForestIndex | null>
writeForestIndex(index: ForestIndex): Promise<void>
readTreeMeta(treeId: string): Promise<TreeJSON | null>
writeTreeMeta(treeId: string, json: TreeJSON): Promise<void>
deleteTreeMeta(treeId: string): Promise<void>
```

Node-content methods (`readNodeContent`, `writeNodeContent`, `deleteNodeContent`)
and `listNodeIds` are unchanged. There is no batch delete: `ForestStore.deleteTree`
loops `deleteNodeContent` over the tree's node ids.

There is **no migration** from the old single-tree layout. Existing local data is
not carried over; a previously exported tree is brought back with Import. See
Risks.

## Core API

New `ForestStore` in `@asktree/core`, constructed with a `StorageAdapter`:

```ts
static load(adapter): Promise<ForestStore>
listTrees(): Array<{ id: string; title: string; updatedAt: number }>
getActiveTreeId(): string | null
getActiveTree(): TreeStore | null
getTree(id): TreeStore
setActiveTree(id): Promise<void>            // persists activeTreeId
createTree(content, title): Promise<Node>   // appends, becomes active
importBundle(bundle): Promise<string>       // appends as new tree, returns new treeId
exportTree(id): Promise<ExportBundle>
deleteTree(id): Promise<void>               // tree meta + all node contents
renameTree(id, title): Promise<void>        // sets root node title
```

`TreeStore` keeps `createTree`'s "Tree already exists" guard; because each document
has its own `TreeStore`, it no longer blocks creating a second document.
`TreeStore.deserialize` takes the `treeId` it is being loaded as:
`deserialize(json, adapter, treeId)`. `TreeStore.importBundle` is removed; importing
is now `ForestStore.importBundle` with id remapping (below).

## Import / export semantics

- **Import always adds a new document.** It assigns a fresh `treeId` and remaps
  every node id and edge id in the bundle, rewriting content keys and
  `readingPositions` keys accordingly. Consequently imports can never collide with
  or overwrite existing documents, and importing the same file twice yields two
  independent documents.
- **Export is per document.** `exportTree(id)` returns the same
  `ExportBundle { version, tree, contents }` shape as today, so files exported by
  v0.2.0 still import.

## UI

### Sidebar (forest view)

- Heading becomes **Documents**.
- One row per document, in `ForestIndex.trees` order:
  - chevron to expand/collapse the document's subtree (independent of activation),
  - status dot and title of the root node,
  - highlighted when it is the active document.
- Clicking the row activates the document. Expanded rows render the existing
  subtree indentation below.
- Hover actions per row: **rename**, **export**, **delete**.
  - Rename: inline text input; Enter/blur commits (empty falls back to
    `Untitled`), Escape cancels.
  - Export: downloads that document as JSON using the existing save-file helper.
  - Delete: opens the existing `ConfirmModal`; on confirm the whole document and
    its node contents are removed.
- A `＋ New` control at the top of the sidebar clears the active selection so the
  creation form is shown (see below). This is non-destructive: the previous
  document stays in the forest and is reopened by clicking its row.

### Header

- `📂` opens a Markdown file as a **new** document (append; no replace prompt).
- `Import Tree` appends a document from JSON.
- `Export Tree` exports the **active** document; disabled when none is active.
- `🧹` is **removed**. Clearing one document is now "delete that document" in the
  sidebar.

### Welcome / empty state

Unchanged in appearance. It is shown whenever **no document is active** — either
because the forest is empty or because `＋ New` cleared the active selection.
`Start Learning` and `Open Markdown File` create a document and make it active.

## State management

- `useTree` gains a `ForestStore` ref and exposes `trees`, `activeTreeId`,
  `setActiveTree`, `createDocument`, `deleteDocument`, `renameDocument`,
  `exportDocument`, `importDocument`. `store` continues to mean the **active**
  `TreeStore`.
- The active `TreeStore` must be React state (not only a ref) so that switching
  documents re-renders consumers; today the provider captures `storeRef.current`.
- Switching documents resets `activePath` to the new root and clears
  `selectedText`.
- `treeVersion` is bumped on every forest change (create, import, delete, rename,
  switch) as well as node mutations, so derived views refresh.
- Deleting the active document activates the next remaining one (the previous one
  if the last was deleted); deleting the last document returns to the welcome
  state.

## Edge cases

- Duplicate titles are allowed; documents are distinguished by `treeId`.
- `activeTreeId: null` with a non-empty `trees` list is valid (the creation view);
  do not force-activate a document on load.
- A stored `ForestIndex` referencing a missing `tree:<id>` key: skip that entry
  and continue, rather than failing the whole load.
- Import of a malformed bundle: surface an error message, change nothing.
- Content for a missing node id is already tolerated (`readNodeContent` rejects;
  callers fall back to empty).

## Testing

- **core / ForestStore:** create/list/activate/rename/delete; active id
  persistence across `load`; import remaps all ids and re-imports cleanly; export
  round-trips; deleting a tree removes its node contents.
- **storage adapters:** forest index read/write; per-tree meta read/write/delete
  (IndexedDB via `fake-indexeddb`).
- **web:** sidebar renders multiple roots with the active one highlighted;
  expand/collapse; switch updates the dual panel; rename commits and cancels;
  delete asks for confirmation and removes the document; header export targets the
  active document and import appends.
- Existing 130 tests are updated for the changed context API (component tests mock
  `useTree`).

## Risks

- **Context API churn:** `useTree`'s shape changes, and several component tests
  mock it. Budget for updating those mocks.
- **Eager loading:** `load` deserializes every `TreeJSON`. These contain node
  metadata only (no content), so the cost is small at realistic document counts.
  If a forest grows very large, load trees lazily; the index already carries ids.
- **Destructive delete:** removing a whole document is irreversible; it must go
  through `ConfirmModal`, and it must delete node contents, not just metadata, to
  avoid orphaned blobs.
- **No migration (accepted):** after this change, an existing instance's single
  tree (stored under the old `tree_meta` key) is not shown and not migrated. The
  owner has accepted re-importing previously exported trees. The stale
  `tree_meta` key is simply ignored; there is no code to read or clean it.

## Future work

- Lazy tree loading, per-document settings, cross-document search, drag-and-drop
  of documents to reorder the sidebar.
