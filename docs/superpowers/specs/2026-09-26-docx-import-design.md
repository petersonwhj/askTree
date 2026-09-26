# Word (.docx) Import and Document Kind

- **Date:** 2026-09-26
- **Status:** Approved for planning
- **Sub-project:** A of the PDF/Word roadmap (A → B → C → D). B (multimodal image asks),
  C (PDF viewer + crop-to-ask) and D (binary assets in export/import) are separate specs.

## Goal

Let a user open a Word `.docx` file. It is converted to Markdown on import, so the tree,
dual-panel view, questions, math and export all work with no further changes. This also
introduces a document `kind` field that records the source format, so later sub-projects
(PDF) can branch on it.

## Non-goals

- Legacy `.doc`, `.rtf`, `.odt` (`.doc` produces a clear error).
- Preserving the original `.docx` bytes or pixel-accurate layout. Conversion is
  best-effort structure (headings, lists, tables, emphasis, images).
- Rendering `.docx` directly (no viewer). It becomes a Markdown document.
- Anything PDF: `kind: "pdf"` is reserved here but unused until sub-project C.

## Terminology

- **Document kind:** the source format of a document:
  `"markdown" | "docx" | "pdf"`. It is metadata about provenance; in this sub-project
  `"markdown"` and `"docx"` behave identically (both are rendered as Markdown).

## Current state

- Root node content is a Markdown string, stored per node.
- `TreeStore` owns one tree; `ForestStore` owns the forest index, one `TreeStore` per
  document, and `listTrees()` returns `TreeSummary { id, title, updatedAt }`.
- Three UI entry points create a document from a file: `AppHeader`'s `📂` input, the
  `DualPanel` empty-state "Open Markdown File" input, and the `DualPanel` empty-state
  drop handler. Each independently reads the file, derives the title from the filename
  and calls `createDocument(text, title)`.
- `ExportBundle` carries `{ version, tree, contents }`; `tree` is `TreeJSON`.

## Data model: `kind`

In `@asktree/core`:

```ts
export type DocumentKind = "markdown" | "docx" | "pdf";
```

- `TreeJSON.kind?: DocumentKind` — **optional**. An absent value means `"markdown"`, so
  trees and export bundles written before this change keep working.
- `TreeStore` gains a `kind`: the constructor becomes
  `new TreeStore(adapter, treeId?, kind = "markdown")`, with a `kind` getter.
  `serialize()` always writes `kind`; `deserialize()` reads it, defaulting to
  `"markdown"` when absent.
- `TreeSummary` gains `kind: DocumentKind`; `ForestStore.listTrees()` fills it from its
  `TreeStore`.
- `ForestStore.createTree(content, title, kind: DocumentKind = "markdown")`.
- `ForestStore.importBundle` preserves the bundle's `tree.kind` (default `"markdown"`).
- `useTree` exposes `createDocument(content, title, kind?)`.
- `ExportBundle` is unchanged: `kind` travels inside `tree`.

## File pipeline

All three entry points go through one shared helper so the dispatch logic lives in one
place:

```ts
// apps/web/src/lib/open-document.ts
export type OpenDocument = (content: string, title: string, kind?: DocumentKind) => Promise<void>;

export async function openDocumentFile(file: File, create: OpenDocument): Promise<void>;
```

Behaviour:

1. Derive the title from the filename, stripping `.md`, `.markdown`, `.txt` or `.docx`.
2. Dispatch on the lowercased extension:
   - `.docx` → `const markdown = await docxToMarkdown(file)`, then
     `create(markdown, title, "docx")`.
   - `.md`, `.markdown`, `.txt` → `create(await file.text(), title, "markdown")`.
   - `.doc` → throw `Legacy .doc files aren't supported. Save it as .docx and try again.`
   - anything else → throw a message naming the file and the supported extensions.
3. Failures propagate to the caller as an `Error` whose `message` is user-facing; the
   caller shows it with its existing surface (`alert` in `AppHeader`, the error banner in
   `DualPanel`). **No document is created on failure.**

The three call sites are updated to call `openDocumentFile(file, createDocument)` and
their `accept` attributes become `.md,.markdown,.txt,.docx` (the drop handler accepts any
file and relies on the dispatch).

## Conversion module

`apps/web/src/lib/import-docx.ts`:

```ts
export async function docxToMarkdown(file: File): Promise<string>;
```

- `mammoth` converts the `.docx` to HTML; embedded images become `data:` URIs.
- `turndown` + `turndown-plugin-gfm` convert that HTML to Markdown (ATX headings, fenced
  code, GFM tables / strikethrough / task lists).
- Both libraries are loaded with dynamic `import()` **only when a `.docx` is opened**, so
  the main bundle is unaffected (mammoth is ~2.2 MB unpacked).
- It lives in the web app, not `@asktree/core`, to keep core dependency-free. If a future
  VS Code extension needs it, the module can move to a shared package.
- An empty result (no readable text) throws
  `No readable text found in "<filename>".`

## UI

- Each `.doc-row` in the sidebar gets `data-kind={kind}`.
- A small badge (`.doc-kind`) shows the kind when it is not `"markdown"` (in this
  sub-project, `docx`). Markdown documents show no badge, to avoid clutter.

## Testing

- **Conversion (unit):** `docxToMarkdown` against a small committed fixture
  `apps/web/src/lib/__tests__/fixtures/sample.docx`, asserting an ATX heading, bold text,
  a GFM table row and an embedded `![](data:image` are present. The fixture is generated
  once by a script that writes a minimal valid OOXML zip.
- **Dispatch (unit):** `openDocumentFile` creates a `docx` document for `.docx` (with the
  converter mocked), a `markdown` document for `.md`, and throws a readable error for
  `.doc` and unknown extensions.
- **Kind (unit, core):** `TreeStore` round-trips `kind` through serialize/deserialize and
  defaults to `"markdown"` when absent; `ForestStore.createTree`/`listTrees`/`importBundle`
  preserve it.
- **Component:** `AppHeader` and `DualPanel` call `createDocument` with kind `"docx"` when
  a `.docx` is selected (converter mocked), and surface an error without creating a
  document when conversion fails.
- **End-to-end (Playwright):** opening the `.docx` fixture renders its Markdown in the
  panel.

## Risks

- **jsdom vs. the converter.** mammoth may depend on browser APIs that jsdom lacks, so the
  real conversion may not run in Vitest. If the fixture test cannot run in jsdom, run the
  conversion assertion only in the Playwright test (real Chromium) and keep the Vitest
  coverage on dispatch and `kind` plumbing. Report which path was taken.
- **Types.** `turndown-plugin-gfm` has no bundled types; add a small local `.d.ts` shim
  (the same pattern already used for `markdown-it-texmath`). `mammoth` ships its own types.
- **Bundle size.** Mitigated by the dynamic import; verify the built main chunk did not
  grow by the size of mammoth.

## Future

- **B:** multimodal asks (image + text to the LLM).
- **C:** `kind: "pdf"` — render the PDF, crop-to-ask, page ±1 context.
- **D:** binary assets (PDF bytes, crops) in export/import.
