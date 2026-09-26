# Word (.docx) Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a Word `.docx` file by converting it to Markdown on import, and record each document's source format as a `kind`.

**Architecture:** `kind` (`"markdown" | "docx" | "pdf"`) flows through `TreeStore` → `ForestStore` → `useTree`. All three file entry points call one `openDocumentFile` dispatcher, which converts `.docx` via a lazily imported `docxToMarkdown` (mammoth → HTML → turndown + GFM). No PDF work here; `"pdf"` is reserved.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest + Testing Library, React 18, Playwright, mammoth + turndown + turndown-plugin-gfm.

**Spec:** `docs/superpowers/specs/2026-09-26-docx-import-design.md`

## Global Constraints

- Only `.docx` is supported for Word. `.doc` must produce the error
  `Legacy .doc files aren't supported. Save it as .docx and try again.`
- `TreeJSON.kind` is **optional**; an absent value means `"markdown"`.
- All errors surfaced to the user are `Error` instances whose `message` is user-facing.
- **No document is created when import fails.**
- mammoth and turndown must be loaded with dynamic `import()` (never statically), so the
  main bundle does not grow by mammoth's ~2.2 MB.
- No new runtime dependencies in `@asktree/core`.
- Run from `/home/whj/Repo/askTree`; Node via `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- Tests: core in `tests/core/`, web in `apps/web/src/**/__tests__/`, E2E in `e2e/`.

---

## File Structure

- `packages/core/src/types.ts` — `DocumentKind`, `TreeJSON.kind?`, `TreeSummary.kind` (modify)
- `packages/core/src/tree-store.ts` — `kind` on construct/serialize/deserialize (modify)
- `packages/core/src/forest-store.ts` — `kind` on create/list/import (modify)
- `packages/core/src/index.ts` — export `DocumentKind` (modify)
- `apps/web/src/hooks/useTree.tsx` — `createDocument(content, title, kind?)` (modify)
- `apps/web/src/lib/import-docx.ts` — the converter (create)
- `apps/web/src/lib/open-document.ts` — the dispatcher (create)
- `apps/web/src/types/turndown-plugin-gfm.d.ts` — type shim (create)
- `scripts/make-docx-fixture.py` — fixture generator (create)
- `apps/web/src/lib/__tests__/fixtures/sample.docx` — test fixture (create, committed)
- `apps/web/src/components/AppHeader.tsx`, `DualPanel.tsx`, `TreeSidebar.tsx` — wiring + badge (modify)
- `apps/web/src/App.css` — badge style (modify)
- `e2e/docx.spec.ts` — end-to-end (create)

---

### Task 1: `DocumentKind` and `TreeStore.kind`

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/tree-store.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/tree-store.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `type DocumentKind = "markdown" | "docx" | "pdf"`; `TreeJSON.kind?: DocumentKind`; `new TreeStore(adapter, treeId?, kind = "markdown")`; `TreeStore.kind: DocumentKind`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/tree-store.test.ts` inside the top-level `describe("TreeStore", ...)`:

```ts
  describe("kind", () => {
    it("defaults to markdown and serializes it", async () => {
      await store.createTree("r", "Root");
      expect(store.kind).toBe("markdown");
      expect(store.serialize().kind).toBe("markdown");
    });

    it("carries a non-default kind through serialize and deserialize", async () => {
      const docx = new TreeStore(adapter, "tree-9", "docx");
      await docx.createTree("r", "Root");
      const restored = await TreeStore.deserialize(docx.serialize(), adapter, "tree-9");
      expect(restored.kind).toBe("docx");
    });

    it("treats an absent kind as markdown", async () => {
      await store.createTree("r", "Root");
      const json = store.serialize();
      delete (json as { kind?: unknown }).kind;
      const restored = await TreeStore.deserialize(json, adapter, "tree-9");
      expect(restored.kind).toBe("markdown");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/core/tree-store.test.ts`
Expected: FAIL — `store.kind` is `undefined`, `new TreeStore(adapter, "tree-9", "docx")` accepts the arg but ignores it.

- [ ] **Step 3: Add the type**

In `packages/core/src/types.ts`, above `interface TreeJSON`:

```ts
export type DocumentKind = "markdown" | "docx" | "pdf";
```

And add to `TreeJSON`:

```ts
  /** Source format of the document. Absent means "markdown". */
  kind?: DocumentKind;
```

- [ ] **Step 4: Add `kind` to TreeStore**

In `packages/core/src/tree-store.ts`, import the type and extend the constructor:

```ts
import type { Node, Edge, TreeJSON, ExportBundle, DocumentKind } from "./types";
```

```ts
  constructor(
    private adapter: StorageAdapter,
    readonly treeId: string = crypto.randomUUID(),
    readonly kind: DocumentKind = "markdown",
  ) {}
```

In `serialize()`, add `kind` to the returned object:

```ts
    return {
      version: 1,
      kind: this.kind,
      rootNodeId: this.rootNodeId,
      nodes: nodesObj,
      createdAt: rootNode?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...(this.readingPositions.size > 0
        ? { readingPositions: Object.fromEntries(this.readingPositions) }
        : {}),
    };
```

In `deserialize()`, pass the kind through:

```ts
  static async deserialize(
    json: TreeJSON,
    adapter: StorageAdapter,
    treeId: string = crypto.randomUUID(),
  ): Promise<TreeStore> {
    const store = new TreeStore(adapter, treeId, json.kind ?? "markdown");
```

- [ ] **Step 5: Export the type**

In `packages/core/src/index.ts`, add `DocumentKind` to the type export list:

```ts
export type { Node, Edge, TreeJSON, ExportBundle, LLMConfig, ContextSlice, AskOptions, PromptConfig, ForestIndex, TreeSummary, DocumentKind } from "./types";
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test tests/core/tree-store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/tree-store.ts packages/core/src/index.ts tests/core/tree-store.test.ts
git commit -m "Add a document kind to TreeStore"
```

---

### Task 2: `ForestStore` and `TreeSummary` carry `kind`

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/forest-store.ts`
- Test: `tests/core/forest-store.test.ts`

**Interfaces:**
- Consumes: Task 1's `DocumentKind`, `TreeStore.kind`, `TreeJSON.kind`.
- Produces: `TreeSummary.kind: DocumentKind`; `ForestStore.createTree(content, title, kind = "markdown")`; `listTrees()` fills `kind`; `importBundle` preserves `kind`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/forest-store.test.ts`:

```ts
describe("ForestStore kind", () => {
  it("defaults new documents to markdown", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha");
    expect(forest.listTrees()[0].kind).toBe("markdown");
  });

  it("records a docx document", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha", "docx");
    expect(forest.listTrees()[0].kind).toBe("docx");
    expect(forest.getActiveTree()!.kind).toBe("docx");
  });

  it("preserves kind through export and import", async () => {
    const adapter = new InMemoryStorageAdapter();
    const forest = await ForestStore.load(adapter);
    await forest.createTree("a", "Alpha", "docx");
    const bundle = await forest.exportTree(forest.listTrees()[0].id);
    expect(bundle.tree.kind).toBe("docx");

    const newId = await forest.importBundle(bundle);
    expect(forest.listTrees().find((t) => t.id === newId)?.kind).toBe("docx");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: FAIL — `listTrees()[0].kind` is `undefined`.

- [ ] **Step 3: Add `kind` to TreeSummary**

In `packages/core/src/types.ts`:

```ts
export interface TreeSummary {
  id: string;
  title: string;
  updatedAt: number;
  kind: DocumentKind;
}
```

- [ ] **Step 4: Thread `kind` through ForestStore**

In `packages/core/src/forest-store.ts`, change the type import and the three methods:

```ts
import type { Node, TreeJSON, ExportBundle, ForestIndex, TreeSummary, DocumentKind } from "./types";
```

```ts
  async createTree(content: string, title: string, kind: DocumentKind = "markdown"): Promise<Node> {
    const treeId = crypto.randomUUID();
    const store = new TreeStore(this.adapter, treeId, kind);
```

In `listTrees()`, include the kind:

```ts
        summaries.push({
          id,
          title: store.getRoot().title,
          updatedAt: store.serialize().updatedAt,
          kind: store.kind,
        });
```

In `importBundle()`, carry the kind onto the remapped `TreeJSON`:

```ts
    const json: TreeJSON = {
      version: 1,
      kind: bundle.tree.kind ?? "markdown",
      rootNodeId: remap(bundle.tree.rootNodeId),
      nodes: remappedNodes,
      createdAt: bundle.tree.createdAt,
      updatedAt: Date.now(),
      ...(Object.keys(readingPositions).length > 0 ? { readingPositions } : {}),
    };
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: PASS. Then `pnpm test tests/core` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/forest-store.ts tests/core/forest-store.test.ts
git commit -m "Carry document kind through the forest"
```

---

### Task 3: `useTree.createDocument` accepts a kind

**Files:**
- Modify: `apps/web/src/hooks/useTree.tsx`
- Test: `apps/web/src/hooks/__tests__/useTree.test.tsx`

**Interfaces:**
- Consumes: `ForestStore.createTree(content, title, kind)` from Task 2.
- Produces: `createDocument: (content: string, title: string, kind?: DocumentKind) => Promise<void>`.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/hooks/__tests__/useTree.test.tsx`, extend the `Probe` and add a test:

```tsx
function Probe() {
  const { trees, activeTreeId, createDocument, deleteDocument, isLoading } = useTree();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="count">{trees.length}</span>
      <span data-testid="active">{activeTreeId ?? "none"}</span>
      <span data-testid="kind">{trees[0]?.kind ?? "none"}</span>
      <button onClick={() => createDocument("body", "Doc")}>create</button>
      <button onClick={() => createDocument("body", "Docx", "docx")}>create-docx</button>
      <button onClick={() => deleteDocument(trees[0].id)}>delete-first</button>
    </div>
  );
}

it("records the document kind", async () => {
  render(
    <TreeProvider>
      <Probe />
    </TreeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  fireEvent.click(screen.getByText("create-docx"));
  await waitFor(() => expect(screen.getByTestId("kind").textContent).toBe("docx"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test apps/web/src/hooks/__tests__/useTree.test.tsx`
Expected: FAIL — `createDocument` ignores the third argument, `kind` stays `"markdown"`.

- [ ] **Step 3: Thread the kind through**

In `apps/web/src/hooks/useTree.tsx`, add `DocumentKind` to the core type import, update the interface, and the callback:

```ts
  createDocument: (content: string, title: string, kind?: DocumentKind) => Promise<void>;
```

```ts
  const createDocument = useCallback(async (content: string, title: string, kind?: DocumentKind) => {
    const forest = forestRef.current;
    if (!forest) return;
    await forest.createTree(content, title, kind);
    setSelectedText(null);
    refresh(forest);
  }, [refresh]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test apps/web/src/hooks/__tests__/useTree.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useTree.tsx apps/web/src/hooks/__tests__/useTree.test.tsx
git commit -m "Let createDocument record a document kind"
```

---

### Task 4: `docxToMarkdown` converter

**Files:**
- Modify: `apps/web/package.json` (dependencies)
- Create: `apps/web/src/types/turndown-plugin-gfm.d.ts`
- Create: `scripts/make-docx-fixture.py`
- Create: `apps/web/src/lib/__tests__/fixtures/sample.docx` (generated, committed)
- Create: `apps/web/src/lib/import-docx.ts`
- Test: `apps/web/src/lib/__tests__/import-docx.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `docxToMarkdown(file: File): Promise<string>`.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @asktree/web add mammoth@1.12.3 turndown@7.2.4 turndown-plugin-gfm@1.0.2
pnpm --filter @asktree/web add -D @types/turndown@5.0.6
```

- [ ] **Step 2: Add the type shim**

Create `apps/web/src/types/turndown-plugin-gfm.d.ts`:

```ts
declare module "turndown-plugin-gfm" {
  export function gfm(service: unknown): void;
  export function tables(service: unknown): void;
  export function strikethrough(service: unknown): void;
  export function taskListItems(service: unknown): void;
}
```

- [ ] **Step 3: Generate the fixture**

Create `scripts/make-docx-fixture.py`:

```python
"""Generate a minimal .docx used by the import tests. Run once; commit the output."""
import os
import zipfile

OUT = "apps/web/src/lib/__tests__/fixtures/sample.docx"

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOCUMENT = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>bold text</w:t></w:r><w:r><w:t> and plain</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>Col A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Col B</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>a1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b1</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
</w:body></w:document>"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", CONTENT_TYPES)
    z.writestr("_rels/.rels", ROOT_RELS)
    z.writestr("word/document.xml", DOCUMENT)
print("wrote", OUT)
```

Run it and confirm the file appears (it is a zip; `python3 -c "import zipfile;print(zipfile.is_zipfile('apps/web/src/lib/__tests__/fixtures/sample.docx'))"` → `True`):

```bash
python3 scripts/make-docx-fixture.py
```

- [ ] **Step 4: Write the failing test**

Create `apps/web/src/lib/__tests__/import-docx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { docxToMarkdown } from "../import-docx";

const here = dirname(fileURLToPath(import.meta.url));

async function fixtureFile(): Promise<File> {
  const bytes = readFileSync(resolve(here, "fixtures/sample.docx"));
  const file = new File([bytes], "sample.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  // jsdom's Blob has no arrayBuffer(); supply it from the raw bytes.
  Object.defineProperty(file, "arrayBuffer", {
    value: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

describe("docxToMarkdown", () => {
  it("converts bold text and a GFM table to markdown", async () => {
    const markdown = await docxToMarkdown(await fixtureFile());
    expect(markdown).toContain("**bold text**");
    expect(markdown).toMatch(/\|\s*Col A\s*\|\s*Col B\s*\|/);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm test apps/web/src/lib/__tests__/import-docx.test.ts`
Expected: FAIL — cannot resolve `../import-docx`.

- [ ] **Step 6: Implement the converter**

Create `apps/web/src/lib/import-docx.ts`:

```ts
/** Convert a .docx file to Markdown using mammoth (docx → HTML) and turndown (HTML → md). */
export async function docxToMarkdown(file: File): Promise<string> {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }] = await Promise.all([
    import("mammoth"),
    import("turndown"),
    import("turndown-plugin-gfm"),
  ]);

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  turndown.use(gfm);

  const markdown = turndown.turndown(html).trim();
  if (!markdown) throw new Error(`No readable text found in "${file.name}".`);
  return markdown;
}
```

- [ ] **Step 7: Run to verify it passes**

Run: `pnpm test apps/web/src/lib/__tests__/import-docx.test.ts`
Expected: PASS.

If it fails because jsdom cannot run mammoth (an error mentioning jsdom, `document`, `TextDecoder`, `arrayBuffer`, or similar rather than a wrong assertion), do this instead and record it in the commit message: delete `import-docx.test.ts` and rely on the Playwright test in Task 7 for the real conversion; the risk is documented in the spec.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/types/turndown-plugin-gfm.d.ts apps/web/src/lib/import-docx.ts apps/web/src/lib/__tests__/import-docx.test.ts scripts/make-docx-fixture.py apps/web/src/lib/__tests__/fixtures/sample.docx
git commit -m "Convert .docx to markdown with mammoth and turndown"
```

---

### Task 5: `openDocumentFile` dispatcher

**Files:**
- Create: `apps/web/src/lib/open-document.ts`
- Test: `apps/web/src/lib/__tests__/open-document.test.ts`

**Interfaces:**
- Consumes: `docxToMarkdown` from Task 4; `DocumentKind` from `@asktree/core`.
- Produces: `type OpenDocument = (content: string, title: string, kind?: DocumentKind) => Promise<void>`; `openDocumentFile(file: File, create: OpenDocument): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/open-document.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { openDocumentFile } from "../open-document";

vi.mock("../import-docx", () => ({
  docxToMarkdown: vi.fn(async () => "# Converted"),
}));

function markdownFile(name: string, text: string): File {
  const file = new File([text], name, { type: "text/markdown" });
  // jsdom's Blob has no text(); supply it.
  Object.defineProperty(file, "text", { value: async () => text });
  return file;
}

describe("openDocumentFile", () => {
  it("converts a .docx and records kind docx", async () => {
    const create = vi.fn();
    await openDocumentFile(new File(["x"], "My Article.docx"), create);
    expect(create).toHaveBeenCalledWith("# Converted", "My Article", "docx");
  });

  it("reads markdown files as kind markdown", async () => {
    const create = vi.fn();
    await openDocumentFile(markdownFile("notes.md", "# Notes"), create);
    expect(create).toHaveBeenCalledWith("# Notes", "notes", "markdown");
  });

  it("rejects legacy .doc files", async () => {
    await expect(
      openDocumentFile(new File(["x"], "old.doc"), vi.fn()),
    ).rejects.toThrow("Legacy .doc files aren't supported. Save it as .docx and try again.");
  });

  it("rejects unsupported files by name", async () => {
    await expect(
      openDocumentFile(new File(["x"], "photo.png"), vi.fn()),
    ).rejects.toThrow('Unsupported file "photo.png"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test apps/web/src/lib/__tests__/open-document.test.ts`
Expected: FAIL — cannot resolve `../open-document`.

- [ ] **Step 3: Implement the dispatcher**

Create `apps/web/src/lib/open-document.ts`:

```ts
import type { DocumentKind } from "@asktree/core";
import { docxToMarkdown } from "./import-docx";

export type OpenDocument = (
  content: string,
  title: string,
  kind?: DocumentKind,
) => Promise<void>;

const DOCX = /\.docx$/i;
const DOC = /\.doc$/i;
const MARKDOWN = /\.(md|markdown|txt)$/i;

export function documentTitle(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt|docx)$/i, "");
}

export async function openDocumentFile(file: File, create: OpenDocument): Promise<void> {
  const title = documentTitle(file.name) || "Untitled";

  if (DOCX.test(file.name)) {
    await create(await docxToMarkdown(file), title, "docx");
    return;
  }
  if (DOC.test(file.name)) {
    throw new Error("Legacy .doc files aren't supported. Save it as .docx and try again.");
  }
  if (MARKDOWN.test(file.name) || file.type.startsWith("text/")) {
    await create(await file.text(), title, "markdown");
    return;
  }
  throw new Error(
    `Unsupported file "${file.name}". Open a .md, .markdown, .txt or .docx file.`,
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test apps/web/src/lib/__tests__/open-document.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/open-document.ts apps/web/src/lib/__tests__/open-document.test.ts
git commit -m "Dispatch file opens by type through one helper"
```

---

### Task 6: Wire the entry points and show the badge

**Files:**
- Modify: `apps/web/src/components/AppHeader.tsx`
- Modify: `apps/web/src/components/DualPanel.tsx`
- Modify: `apps/web/src/components/TreeSidebar.tsx`
- Modify: `apps/web/src/App.css`
- Test: `apps/web/src/components/__tests__/AppHeader.test.tsx`, `DualPanel.test.tsx`, `TreeSidebar.test.tsx`

**Interfaces:**
- Consumes: `openDocumentFile` from Task 5; `TreeSummary.kind` from Task 2.
- Produces: `accept=".md,.markdown,.txt,.docx"` on the two file inputs; `.doc-row[data-kind]`; `.doc-kind` badge shown when `kind !== "markdown"`.

- [ ] **Step 1: Update the existing DualPanel assertion and add a docx test**

In `apps/web/src/components/__tests__/DualPanel.test.tsx`, add the mock at the top (next to the existing `vi.mock`):

```tsx
vi.mock("../../lib/import-docx", () => ({
  docxToMarkdown: vi.fn(async () => "# Converted"),
}));
```

The existing test asserts two arguments; it must now expect the kind:

```tsx
    await waitFor(() => expect(createDocument).toHaveBeenCalledWith("# Hi\n\nbody", "My Article", "markdown"));
```

Add a docx case:

```tsx
  it("opens a .docx in the empty state as a docx document", async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined);
    mocks.ctx = { ...mocks.ctx, activePath: [], selectedText: null, createDocument };
    render(<DualPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "My Article.docx");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith("# Converted", "My Article", "docx"));
  });
```

- [ ] **Step 2: Add an AppHeader docx test**

In `apps/web/src/components/__tests__/AppHeader.test.tsx`, add the same `vi.mock("../../lib/import-docx", ...)`, then:

```tsx
  it("opens a .docx as a docx document", async () => {
    const createDocument = vi.fn();
    mocks.ctx = { ...baseCtx(), createDocument };

    const { container } = render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    const input = container.querySelector('header input[accept=".md,.markdown,.txt,.docx"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [new File(["x"], "My Article.docx")] } });

    await waitFor(() => expect(createDocument).toHaveBeenCalledWith("# Converted", "My Article", "docx"));
  });
```

- [ ] **Step 3: Add the sidebar badge test**

In `apps/web/src/components/__tests__/TreeSidebar.test.tsx`, give the summaries kinds and assert the badge:

```tsx
      trees: [
        { id: "alpha", title: "Alpha", updatedAt: 1, kind: "markdown" },
        { id: "beta", title: "Beta", updatedAt: 2, kind: "docx" },
      ],
```

```tsx
  it("marks the document kind, badging only non-markdown documents", () => {
    render(<TreeSidebar />);
    expect(screen.getByTestId("doc-row-alpha").getAttribute("data-kind")).toBe("markdown");
    expect(screen.getByTestId("doc-row-beta").getAttribute("data-kind")).toBe("docx");
    expect(screen.getByTestId("doc-row-beta").querySelector(".doc-kind")?.textContent).toBe("docx");
    expect(screen.getByTestId("doc-row-alpha").querySelector(".doc-kind")).toBeNull();
  });
```

- [ ] **Step 4: Run to verify they fail**

Run: `pnpm test apps/web/src/components/__tests__`
Expected: FAIL — `data-kind` is null, `.doc-kind` missing, and `createDocument` is called with two arguments.

- [ ] **Step 5: Wire AppHeader**

In `apps/web/src/components/AppHeader.tsx`, import the helper and replace the read logic:

```tsx
import { openDocumentFile } from "../lib/open-document";
```

```tsx
  const handleLoadFile = useCallback(async (file: File) => {
    try {
      await openDocumentFile(file, createDocument);
    } catch (e) {
      alert("Failed to load file: " + (e as Error).message);
    }
  }, [createDocument]);
```

Change the file input's accept attribute:

```tsx
          accept=".md,.markdown,.txt,.docx"
```

- [ ] **Step 6: Wire DualPanel**

In `apps/web/src/components/DualPanel.tsx`, import the helper:

```tsx
import { openDocumentFile } from "../lib/open-document";
```

Replace the empty-state `handleOpenFile`:

```tsx
    const handleOpenFile = async (file: File) => {
      try {
        await openDocumentFile(file, createDocument);
      } catch (err) {
        setError((err as Error).message);
      }
    };
```

Replace the drop handler's read with the helper (keep the `onDrop`/drag state handling as it is):

```tsx
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) await handleOpenFile(file);
          }}
```

Change the empty-state input's accept attribute:

```tsx
            accept=".md,.markdown,.txt,.docx"
```

- [ ] **Step 7: Add the badge to TreeSidebar**

In `apps/web/src/components/TreeSidebar.tsx`, set `data-kind` on the row and render the badge:

```tsx
            <div
              data-testid={`doc-row-${tree.id}`}
              data-kind={tree.kind}
              className={`doc-row ${isActive ? "active" : ""}`}
              onClick={() => setActiveTree(tree.id)}
            >
```

```tsx
              ) : (
                <span className="doc-title" title={tree.title}>{tree.title}</span>
              )}

              {tree.kind !== "markdown" && <span className="doc-kind">{tree.kind}</span>}
```

- [ ] **Step 8: Add the badge style**

Append to `apps/web/src/App.css`:

```css
.doc-kind {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
  color: #8b949e; border: 1px solid #30363d; border-radius: 4px;
  padding: 0 4px; margin-left: 4px;
}
```

- [ ] **Step 9: Run to verify they pass**

Run: `pnpm test apps/web/src/components/__tests__`
Expected: PASS. Then `pnpm test` — Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/AppHeader.tsx apps/web/src/components/DualPanel.tsx apps/web/src/components/TreeSidebar.tsx apps/web/src/App.css apps/web/src/components/__tests__/AppHeader.test.tsx apps/web/src/components/__tests__/DualPanel.test.tsx apps/web/src/components/__tests__/TreeSidebar.test.tsx
git commit -m "Open .docx files from every entry point and badge the kind"
```

---

### Task 7: End-to-end proof in a real browser

**Files:**
- Create: `e2e/docx.spec.ts`

**Interfaces:**
- Consumes: the fixture from Task 4; the wired UI from Task 6.
- Produces: a Playwright test that exercises the real mammoth + turndown conversion.

- [ ] **Step 1: Write the test**

Create `e2e/docx.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, "../apps/web/src/lib/__tests__/fixtures/sample.docx");

test("opens a .docx as a markdown document", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('header input[accept=".md,.markdown,.txt,.docx"]')
    .setInputFiles(FIXTURE);

  await expect(page.locator(".doc-row")).toHaveCount(1);
  await expect(page.locator(".doc-row .doc-kind")).toHaveText("docx");
  await expect(page.getByText("bold text")).toBeVisible();
  await expect(page.getByText("Col A")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:e2e --reporter=list e2e/docx.spec.ts`
Expected: 1 passed.

Note for this environment: the Playwright browser was installed manually and Chromium needs
`LD_LIBRARY_PATH` pointing at a local `libasound.so.2`; prefix the command with
`LD_LIBRARY_PATH=/tmp/opencode/alsa/usr/lib/x86_64-linux-gnu` if the browser fails to
launch. On a normal machine run `pnpm exec playwright install chromium` first.

- [ ] **Step 3: Commit**

```bash
git add e2e/docx.spec.ts
git commit -m "Add an end-to-end docx import test"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: The whole test suite**

Run: `pnpm test`
Expected: all files pass, 0 failures.

- [ ] **Step 2: Types and build**

Run: `pnpm lint`
Expected: 0 errors.
Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 3: Confirm mammoth did not join the main bundle**

Record the entry chunk size and check for a separate async chunk:

```bash
ls -la apps/web/dist/assets/*.js | sort -k5 -n | tail -6
```

Expected: the entry chunk referenced by `apps/web/dist/index.html` is close to the
pre-change size (about 866 KB), and there is an additional async chunk of roughly 1 MB
(mammoth + turndown). If the entry chunk grew by more than ~100 KB, the dynamic `import()`
was not preserved — fix it before continuing.

- [ ] **Step 4: Run the full E2E suite**

Run: `pnpm test:e2e --reporter=list`
Expected: 7 passed (6 forest + 1 docx).

- [ ] **Step 5: Report**

Summarize the observed output for steps 1–4. Do not claim completion without it.

---

## Self-Review

- **Spec coverage:** `DocumentKind` + optional `TreeJSON.kind` (Task 1); `TreeSummary.kind`,
  `ForestStore.createTree/listTrees/importBundle` (Task 2); `useTree.createDocument` kind
  (Task 3); `docxToMarkdown` with lazy mammoth/turndown/GFM and the type shim (Task 4); the
  `openDocumentFile` dispatcher with `.docx`/markdown/`.doc`/unknown handling (Task 5); all
  three entry points and the non-markdown badge (Task 6); real-browser conversion (Task 7);
  bundle-size check (Task 8). The "no direct library" rationale and the fallback to the
  Joplin forks live in the spec.
- **Placeholders:** none — every code step carries the code.
- **Type consistency:** `DocumentKind`, `TreeJSON.kind`, `TreeStore.kind`,
  `TreeSummary.kind`, `ForestStore.createTree(content, title, kind)`,
  `createDocument(content, title, kind?)`, `OpenDocument`, `openDocumentFile(file, create)`,
  `docxToMarkdown(file)`, `.doc-kind`, `data-kind` are used identically everywhere.
