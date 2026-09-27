# Chrome Extension: Clip a Page or PDF into a Forest

- **Date:** 2026-09-27
- **Status:** Approved for planning
- **Sub-project:** E. A (Word), B (images), C+D (PDF) are on `master`; this adds a browser
  extension on top of the existing app.

## Goal

Click the extension's toolbar icon on a web page or a PDF and get a **new AskTree tab** with
the page added as a new document in the extension's own forest. Web pages are clipped to
Markdown; PDFs open in the existing viewer so a region can be cropped and asked about.
Everything the web app already does is reused; the extension is a thin shell plus a capture
step.

## Non-goals

- Sharing data with the hosted web app (the extension has its own forest; export/import is the
  bridge).
- Editing the page, highlighting on the page, or clipping only a text selection (later).
- Publishing to the Chrome Web Store (a separate, later step; a one-time $5 fee).
- Sync across devices.

## Terminology

- **Clip:** one captured item — a page's Markdown or a PDF — added as one document.
- **Pending clip:** the handoff record the background leaves for the app tab to consume.
- **Extension origin:** `chrome-extension://<id>` — the extension's own storage scope.

## Current state (what is reused)

- `@asktree/core`: `ForestStore`, `TreeStore`, storage adapter interface, prompt building,
  LLM providers, `AskImage`, `DocumentKind`, `base64` helpers — all framework-agnostic.
- `apps/web`: the React app, including the PDF viewer (`PdfPane`), the forest sidebar, the ask
  bar and the crop flow. Its build already stages the pdf.js assets into `public/pdfjs`.
- `openDocumentFile` / `createDocument(content, title, kind?, asset?)` — the existing entry
  points for creating a document (asset is a `Blob`, used for PDFs).
- `ImageLightbox`, `ConfirmModal` — the modal styling reused for the shared failure dialog.

## Target behaviour

1. On a **web page**: click the toolbar icon → the page's main content is extracted and
   converted to Markdown → a **new AskTree tab** opens showing the forest with the new document
   active. Its root title is the page's `<title>`.
2. On a **PDF**: click the icon → the PDF's bytes are fetched → a new tab opens with the PDF as
   a `kind: "pdf"` document, rendered by the existing viewer; the root title is the tab title
   (Chrome usually has the PDF's metadata title) or the file name.
3. Every click opens a **new tab** (so the click always visibly does something). The forest is
   shared and persistent, so the new tab shows all documents with the new one selected.
4. The clip carries a source header, e.g.:

   ```
   # <page title>
   > Source: <url> — <date>

   <body markdown>
   ```

5. If extraction yields nothing usable, fall back to converting the whole page. If no content
   can be obtained at all (`chrome://` pages, the Web Store, etc.), **open the tab and show the
   shared "could not load" dialog** — no empty document is created.

## Architecture

```
apps/extension/                     new package
  manifest.json                     MV3: action, background, content script, permissions
  src/background.ts                 service worker: on action click → capture → hand off → open tab
  src/content.ts                    runs in the page: Defuddle + Turndown → Markdown
  src/clip.ts                       pure: normalise a clip (header + markdown), decide fallback
  scripts/build.mjs                 builds the app in extension mode + bundling + assembling dist
apps/web/                           unchanged app; built twice (web, extension mode)
  src/extension/ClipBridge.tsx      feature-detected: consume a pending clip on load
  src/extension/load-notice.tsx     shared "load failed" dialog (web + extension)
```

- **One app, two builds.** `apps/web` gains an `extension` build mode whose only difference is
  `base: "./"` (assets resolve relative to the extension page). `ClipBridge` is compiled into
  every build and simply does nothing unless `chrome.storage` exists, so the app's source does
  not fork. `apps/extension` runs that build, bundles `background`/`content` with Vite, and
  assembles the package with the manifest and icons.
- **Permissions (minimal):** `activeTab`, `scripting`, `storage`. No `<all_urls>`: the
  `activeTab` grant on the icon click covers reading the active tab's URL, injecting the content
  script, and fetching that page's PDF.
- **PDF detection and fetching happen in the background**, because Chrome's built-in PDF viewer
  does not run content scripts. The background treats the tab as a PDF when its URL ends in
  `.pdf` or the response content type is `application/pdf`.
- **Shared storage.** The extension's service worker and its app page share the same origin and
  therefore the same IndexedDB. To avoid duplicating the key layout, the existing
  `IndexedDBStorageAdapter` moves from `apps/web/src/storage/` into `@asktree/core` as a
  browser-only module (it only uses the `indexedDB` global; Node tests never instantiate it).
  Both the web app and the extension then use one implementation.

## Capture

**Web pages (content script):** `Defuddle` extracts the main content and metadata; `Turndown`
(already a dependency) converts it to Markdown. The clip is normalised to title + source header
+ body. Fallback order: Defuddle body → whole `document.body` → fail with a message. The root
title is `document.title` (falling back to the URL's host).

**PDFs (background):** `fetch(tab.url)` with the `activeTab` grant → `arrayBuffer()` → written
to the shared assets store under a fresh id via `IndexedDBStorageAdapter.writeAsset`. The root
title is `tab.title` (falling back to the file name from the URL).

## Handoff

The background stores one pending clip per click and opens a tab pointed at it, so rapid
clicks cannot overwrite each other:

```ts
type PendingClip =
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "pdf"; title: string; assetId: string }
  | { kind: "error"; message: string };
```

- `chrome.storage.session["clips"]` is a map from a fresh id to a `PendingClip`, and the opened
  tab's URL carries `?clip=<id>`.
- Only the small parts travel this way (Markdown text or just an asset id); PDF bytes never go
  through messages, which have a size limit — they are written to the shared assets store first.
- `ClipBridge` (mounted inside the app, feature-detected) reads `?clip=<id>` on load, removes
  that entry, and:
  - markdown → `createDocument(markdown, title)`.
  - pdf → read the asset Blob and `createDocument("", title, "pdf", blob)`.
  - error → show the shared load-failure dialog.

## Shared load-failure dialog

A single dialog (styled like `ConfirmModal`, one “OK” button) reports a document that could not
be opened. It is used by:

- the **web app** when opening a file fails (replacing the current `alert` and inline banner for
  this case), and
- the **extension** when clipping fails.

It lives in the app (not the extension), so the behaviour exists in the web version too and the
extension merely reuses it.

## Storage and concurrency

- The extension's forest lives in the extension origin's IndexedDB and is independent of the
  hosted app. Export/import (JSON or zip) is the only bridge.
- Because each click opens a new tab, several app tabs can be open at once over the same
  IndexedDB. `ForestStore` mutations must **re-read the forest index before writing** it, so two
  tabs adding documents do not clobber each other's index entry. Blob assets and per-tree
  metadata are keyed independently and are not affected.

## Testing

- **Unit (Vitest, jsdom):**
  - `clip.ts`: given sample page HTML, produce the header + Markdown; choose the fallback when
    the extracted body is empty; produce an error result when there is no usable content.
  - The pending-clip consumption logic (with `chrome.storage` stubbed): each variant creates the
    right document; the record is cleared.
  - The load-failure dialog renders the message and dismisses.
  - `IndexedDBStorageAdapter` after its move (existing tests move with it).
- **End-to-end (Playwright, unpacked extension):** launch a persistent Chromium context with
  `--load-extension`, then:
  - the extension's app page loads and shows the forest;
  - invoking the background's capture function on a test page produces a Markdown clip and the
    app tab shows it as a document;
  - clipping a PDF fixture opens it in the viewer;
  - a clip with no content shows the failure dialog.
  - **Known limitation:** Playwright cannot click the browser's toolbar (the extension action),
    so the tests call the same handler the action invokes, from the service worker context; the
    literal icon click is left as a manual check. This is documented rather than worked around.

## Risks

- **Toolbar click is not scriptable** (above): the action handler must be reachable from the
  service worker's global scope so the E2E can invoke it, and the final icon click stays manual.
- **Chrome's PDF viewer is not injectable**: detection/fetch live in the background; a PDF served
  without a `.pdf` URL relies on the response content type.
- **Extension vs web storage**: two separate forests, by design; users who want one must export
  and import.
- **Multiple tabs** over one IndexedDB: mitigated by read-before-write on the index.
- **Moved adapter**: relocating `IndexedDBStorageAdapter` into core touches the web app and its
  tests; keep the public shape identical.
- **Defuddle output varies by site**; the whole-page fallback keeps clipping from failing
  outright.

## Future

- Clip only the selection (context menu / keyboard shortcut).
- A side-panel mode sharing the same capture pipeline.
- Optional "download the original PDF" alongside opening it.
- Chrome Web Store listing.
