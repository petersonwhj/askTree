# PDF Documents: Render, Crop-to-Ask, and Binary Asset Storage

- **Date:** 2026-09-26
- **Status:** Approved for planning
- **Sub-projects:** C (PDF viewer + crop-to-ask) and D (binary asset storage), done together.
  A (Word import) and B (image asks) are already on `master`.

## Goal

Open a PDF as a document, read it, drag a box over part of a page, and ask about that
region. The selected region (a screenshot) plus the current page and its neighbours are sent
to a vision model together with the question. The PDF is stored locally and survives reload,
export and import.

## Non-goals

- Converting a PDF to Markdown, or extracting/using its text layer (it is usually garbled by
  layout; explicitly rejected).
- Text selection inside the PDF. The only selection is a dragged box (a screenshot).
- Editing or re-ordering PDF pages.
- Reading PDFs aloud, forms, annotations, bookmarks.

## Terminology

- **Asset:** a binary document file stored outside the tree (here, a PDF), referenced by id.
- **Crop:** a bitmap of the region the learner dragged, stored on the edge like an image.
- **Page context images:** full-page renders sent for background (current page and ±1); they
  are generated on demand and never persisted.

## Current state

- Documents have `kind: "markdown" | "docx" | "pdf"`; `"pdf"` is reserved. `TreeStore` /
  `ForestStore` / `useTree` all carry it.
- Images attached to a question live on the edge (`Edge.images: AskImage[]`) inside
  `TreeJSON`, and travel with export/import.
- `AskOptions.images?: AskImage[]` is mapped by all three providers (OpenAI-compatible,
  Anthropic, Ollama).
- The left panel renders Markdown (`MarkdownPane`); selection is text-based.
- `StorageAdapter` is string-based (`readNodeContent`/`writeNodeContent`/`deleteNodeContent`,
  plus forest index and per-tree meta). `ExportBundle` is `{ version, tree, contents }`.

## Data model

- `TreeJSON.assetId?: string` — the id of the document's source asset (the PDF). Absent for
  markdown/docx documents. `TreeStore` gains a `assetId` (constructor + serialize/deserialize),
  exposed for the forest summary and the PDF pane.
- `Edge.contextPages?: number[]` — the page numbers whose images were sent, in the order
  they were sent (`[current, current-1, current+1]`, deduplicated and in range). Small
  metadata, enough to rebuild the prompt legend for **Prompt Debug**. Page image bytes are
  **not** stored.
- `Edge.crop?: AskImage` — the dragged region, stored separately from `Edge.images` (which
  keeps holding attachments the user added manually). Keeping them apart removes any doubt
  about which stored image is the selection.
- `PromptConfig.pdfTemplate?: string` — a separate, user-editable template used when the
  current document's `kind` is `"pdf"`. Falls back to a built-in default.

## Asset storage (sub-project D)

New `StorageAdapter` methods:

```ts
readAsset(id: string): Promise<ArrayBuffer | null>;
writeAsset(id: string, data: ArrayBuffer): Promise<void>;
deleteAsset(id: string): Promise<void>;
```

- Assets are `ArrayBuffer` (not `Blob`): it is what pdf.js consumes, what IndexedDB stores
  natively, and it is constructible in tests (this environment's jsdom `Blob` has no
  `arrayBuffer()`).
- `IndexedDBStorageAdapter`: a new object store `assets`, created on upgrade. `DB_VERSION`
  goes `1 → 2`; adding an object store is non-destructive, existing data is untouched.
- `InMemoryStorageAdapter`: a `Map<string, ArrayBuffer>`.
- `TreeStore` gets `setAsset(id, data)` used at import and a read accessor for the PDF pane;
  `ForestStore.deleteTree` deletes the tree's asset; `TreeStore.removeNode` never removes the
  root, so the asset is tied to the document as a whole.

`ExportBundle` gains:

```ts
assets?: Record<string, { mediaType: string; data?: string; file?: string }>;
```

- **JSON export** (small documents): `data` holds base64.
- **zip export** (PDF over the threshold): `file` names the raw entry inside the zip.

## Export / import

- **Threshold:** the PDF's size decides. `<= 10 MB` (default, named constant) → export the
  existing JSON bundle with the PDF base64 in `assets`. `> 10 MB` → export a **zip**.
- **zip layout:**
  ```
  asktree.json      the bundle; each asset entry has mediaType + file: "assets/<id>"
  assets/<id>       the raw PDF bytes
  ```
- **Notify the user** when a zip is produced (a message stating the export is a zip because
  the document exceeds the threshold).
- **Import** accepts `.json` **and** `.zip`. A zip is only accepted when it contains
  `asktree.json` (our format); anything else is rejected with a clear message. Raw asset
  entries are read back into the asset store.
- Export uses the existing `save-text-file` helper for JSON; zip writing uses
  `fflate` (lazy-loaded). For very large files prefer writing through the File System Access
  API when available, otherwise build the zip in memory and download it.
- **Import id remapping:** `ForestStore.importBundle` already remaps node/edge ids; asset ids
  must be remapped too so two imported copies do not collide, and the raw bytes must be
  copied into the asset store under the new ids.

## PDF rendering

- Library: **`pdfjs-dist`** directly (not `react-pdf`, which requires React 19). Set
  `GlobalWorkerOptions.workerSrc` from a Vite `?url` import of the worker module.
- New component `PdfPane` (left panel when the active document's `kind` is `"pdf"`):
  - renders the current page to a `<canvas>`, fitted to the pane width (scale ≈ 1.5 capped by
    a 1600 px longest edge);
  - page navigation: previous/next, an "n / total" indicator;
  - the reading position reuses `setReadingPosition` with `page / pageCount`;
  - opening the document loads the asset blob and hands pdf.js an `ArrayBuffer`.
- The PDF pane replaces `MarkdownPane` only for `kind === "pdf"`; the right (answer) panel
  stays Markdown.

## Crop-to-ask interaction

- Dragging on the page draws a rectangle; on mouse-up, a floating **"Ask about this"** button
  appears over the region (mirroring the text-selection flow).
- Clicking it produces the **crop**: the selected rectangle (in on-screen canvas pixels) is
  mapped back to the PDF page and **re-rendered from pdf.js at a higher scale** (via the
  render `transform` offset), so the crop is crisper than the on-screen render. Output is
  **PNG**. The re-render is capped (max 3× the screen scale, longest output edge 2000 px) so a
  large selection cannot allocate a huge canvas. The crop becomes the **selection context**,
  shown in the ask bar's context row as a thumbnail labelled “About: this capture”, not as an
  ordinary attachment.
- The crop lives in `DualPanel` state (`selectedImage`), set by `PdfPane` via an `onCrop`
  callback; the ask bar's **清空 / Clear** also clears it.
- A minimum drag size is required (ignore accidental tiny drags).
- Past crop rectangles are not drawn on the page (explored marks are text-only today).

## Ask flow (page context, legend, template)

When the user sends from a PDF document:

1. If no crop is selected, behave like a normal free ask (no page images).
2. Otherwise assemble the request images in a **fixed order**:
   1. the crop (`Edge.crop`, the selected region),
   2. any images the user attached manually in the ask bar (`Edge.images`),
   3. the page images for `[current, current-1, current+1]` (deduplicated, in range).
3. Page images are rendered on demand by `PdfPane` through an imperative handle
   (`renderContextImages(): Promise<{ images: AskImage[]; pages: number[] }>`), encoded as
   **JPEG quality ≈ 0.8** at the same scale as the page render. They are not persisted; only
   `edge.contextPages` is.
   - **Page images are cached in memory per open document**, keyed by page number, so asking
     twice on the same page (or moving one page, where the neighbours overlap) does not
     re-render. The cache is bounded (oldest evicted beyond ~10 pages) and cleared when the
     document changes. Rendering is deterministic, so no other invalidation is needed.
   - The current page reuses the already-rendered on-screen canvas instead of rendering it
     again for the request.
4. The **image legend** is generated by the program and appended to the user prompt
   (never editable, so it cannot be broken):

   ```
   Attached images, in order:
   1. Selected region — the learner cropped this from the document (this is what the
      question is about).
   2. Page 3 — the page the region is on.
   3. Page 2 — the previous page.
   4. Page 4 — the next page.
   The question refers to image 1; the other images are background only.
   ```

   When there is no crop, the legend lists the attachments/pages without the “selected
   region” line.
5. **Prompt template:** PDF asks use `PromptConfig.pdfTemplate` (user-editable). The default
   is a short, image-appropriate brief; the legend above is appended after the rendered
   template. Markdown/docx asks keep the existing `template`.
6. **Prompt Debug** rebuilds the same user text, including the legend, from
   `edge.contextPages` and whether the edge has a `crop`.
7. The answer panel renders the edge's `crop` (when present) alongside `images`, so the user
   sees what was asked about.

## Creating a PDF document

`openDocumentFile` and `createDocument` gain an optional asset:

```ts
type OpenDocument = (content: string, title: string, kind?: DocumentKind, asset?: ArrayBuffer) => Promise<void>;
createDocument(content: string, title: string, kind?: DocumentKind, asset?: ArrayBuffer): Promise<void>;
ForestStore.createTree(content, title, kind = "markdown", asset?: ArrayBuffer): Promise<Node>;
```

For a `.pdf` file, `content` is `""` and `asset` is the file's bytes; `TreeStore` writes the
asset under a fresh id and records it as `assetId`. Markdown/docx calls pass no asset.

## UI wiring

- The file inputs and drag & drop accept `.pdf` (in addition to `.md`, `.markdown`, `.txt`,
  `.docx`); `openDocumentFile` dispatches `.pdf` to create a `"pdf"` document whose content
  string is empty and whose asset is the PDF bytes.
- The forest row badges `pdf`.
- The welcome copy mentions PDF.

## Testing

- **Unit (asset store):** `writeAsset`/`readAsset`/`deleteAsset` round-trip an `ArrayBuffer` in
  both adapters; the IndexedDB upgrade keeps existing data.
- **Unit (bundle):** `exportBundle`/`importBundle` round-trip a PDF document through the
  **JSON** path; asset ids are remapped on import; a second import does not collide.
- **Unit (zip):** building and reading the zip round-trips `asktree.json` + `assets/<id>`;
  importing a zip that lacks `asktree.json` is rejected.
- **Unit (ask assembly):** the image order and the legend text for a PDF ask, including page
  dedup at the first/last page and “no crop” cases.
- **Unit (template):** a PDF ask uses `pdfTemplate`; a Markdown ask uses `template`.
- **End-to-end (Playwright):** with a small committed PDF fixture —
  1. open it, see it render, move to the next page;
  2. drag a box, click “Ask about this”, see the crop in the context row;
  3. send with a stubbed model endpoint and assert the request carries the crop **and** the
     page images, and that the legend names image 1 as the selected region;
  4. reload and confirm the PDF and the crop are still there.
  - PDF rendering needs a real canvas, which jsdom lacks, so **all** rendering/crop behaviour
    is asserted in Playwright; Vitest covers the rest.

## Risks

- **pdf.js + Vite worker.** The worker URL/format is the usual source of breakage; verify the
  built app, not just dev.
- **jsdom has no canvas**, so `PdfPane` cannot be unit-tested. This is why the PDF flow is
  E2E-only; keep the unit-testable logic (legend, ordering, asset store, bundle) out of the
  component.
- **Large books.** Storage holds raw bytes (good), but export/import and rendering big pages
  are heavy. The zip path is the answer for export; very large documents may still be slow.
- **Many images per request.** Up to four images (crop + three pages); models may reject or
  truncate. Per the earlier decision there are no app-side limits; provider errors pass
  through. The page-image scale/JPEG settings above are the lever if this bites.
- **IndexedDB upgrade.** Adding a store is safe, but the version bump must be tested against
  an existing v1 database.
- **Large assets in memory.** `readAsset` returns the whole `ArrayBuffer`; pdf.js needs the
  bytes anyway, so this is inherent, but it is the reason export switches to zip above the
  threshold.

## Future

- Draw past crop rectangles on the page (explored marks for PDF).
- Stream zip export/import for very large documents.
- Optional “send only the crop” toggle for scanned books where page images add little.
