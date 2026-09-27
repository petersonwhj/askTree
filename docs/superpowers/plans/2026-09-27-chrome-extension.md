# Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the extension's toolbar icon clips the current page (as Markdown) or PDF into a new AskTree tab's forest, reusing the existing app.

**Architecture:** A new `apps/extension` package holds the MV3 manifest, a service worker and a content script, and builds the existing web app in an `extension` mode (`base: "./"`). Capture is Defuddle (which emits Markdown itself); PDFs are fetched in the background and written to the shared IndexedDB. A feature-detected `ClipBridge` in the app consumes a per-click pending clip. A shared "load failed" dialog is added to the app and used by both the web file-open path and the extension.

**Tech Stack:** TypeScript, Vite, MV3, Defuddle, Vitest, Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-27-chrome-extension-design.md`

## Global Constraints

- Permissions are exactly `activeTab`, `scripting`, `storage`; **never** `<all_urls>`.
- Every icon click opens a **new** tab; the forest is shared and persistent.
- PDF bytes travel through IndexedDB, never through extension messages.
- The extension's forest is independent of the hosted web app.
- `chrome` is used defensively: the app must behave identically when it is absent.
- Branch off `master` (call it `chrome-extension`). Run from `/home/whj/Repo/askTree`; Node via `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`.
- After core changes rebuild before web type-checks: `pnpm --filter @asktree/core build`.

---

## File Structure

- `packages/core/src/indexeddb-adapter.ts` — moved from `apps/web` (create)
- `packages/core/src/forest-store.ts` — race-safe index writes (modify)
- `packages/core/src/index.ts` — export the adapter (modify)
- `apps/web/src/components/LoadNotice.tsx` — shared failure dialog (create)
- `apps/web/src/hooks/useTree.tsx` — `loadNotice` (modify)
- `apps/web/src/App.tsx` — render the dialog (modify)
- `apps/web/src/components/AppHeader.tsx`, `DualPanel.tsx` — route failures to it (modify)
- `apps/web/src/extension/chrome-like.ts` — minimal `chrome` typing/accessor (create)
- `apps/web/src/extension/pending-clip.ts` — clip id + take/consume (create)
- `apps/web/src/extension/ClipBridge.tsx` — consume a clip on load (create)
- `apps/web/vite.config.ts` — `extension` base (modify)
- `apps/extension/` — package: `src/clip.ts`, `src/background.ts`, `src/content.ts`, `manifest.json`, `scripts/build.mjs`, `scripts/make-icons.mjs` (create)
- `e2e/extension.spec.ts` — end-to-end (create)

---

### Task 1: Move `IndexedDBStorageAdapter` into core

**Files:**
- Create: `packages/core/src/indexeddb-adapter.ts`
- Delete: `apps/web/src/storage/indexeddb-adapter.ts`
- Modify: `packages/core/src/index.ts`, `apps/web/src/hooks/useTree.tsx`
- Move: `apps/web/src/storage/__tests__/indexeddb-adapter.test.ts` → `tests/core/indexeddb-adapter.test.ts`

**Interfaces:**
- Produces: `IndexedDBStorageAdapter` exported from `@asktree/core` (unchanged shape).

- [ ] **Step 1: Move the file**

Move the current `apps/web/src/storage/indexeddb-adapter.ts` (including the `DB_NAME`/`DB_VERSION`
constants, the `forest_meta` index, per-tree meta keys and the `assets` store) to
`packages/core/src/indexeddb-adapter.ts`, changing only its type import to the local path:

```ts
import type { StorageAdapter, TreeJSON, ForestIndex } from "./types";
```

- [ ] **Step 2: Export it and update the app**

In `packages/core/src/index.ts`:

```ts
export { InMemoryStorageAdapter } from "./storage-adapter";
export { IndexedDBStorageAdapter } from "./indexeddb-adapter";
```

In `apps/web/src/hooks/useTree.tsx`, replace `import { IndexedDBStorageAdapter } from "../storage/indexeddb-adapter";` with an import from `@asktree/core` (add it to the existing core import block).

- [ ] **Step 3: Move the test**

Move the adapter test to `tests/core/indexeddb-adapter.test.ts`, importing the adapter from the
package:

```ts
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDBStorageAdapter } from "@asktree/core";
import type { ForestIndex } from "@asktree/core";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
```

(the test bodies are unchanged).

- [ ] **Step 4: Verify**

Run: `pnpm test` → PASS (the suite is unchanged in behaviour).
Run: `pnpm --filter @asktree/core build && pnpm lint` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Move IndexedDBStorageAdapter into core so the extension can share it"
```

---

### Task 2: Race-safe forest index writes

**Files:**
- Modify: `packages/core/src/forest-store.ts`
- Test: `tests/core/forest-store.test.ts`

**Interfaces:**
- Produces: `ForestStore` mutations re-read the index immediately before writing it.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/forest-store.test.ts`:

```ts
describe("ForestStore concurrency", () => {
  it("keeps documents added by another store over the same adapter", async () => {
    const adapter = new InMemoryStorageAdapter();
    const a = await ForestStore.load(adapter);
    const b = await ForestStore.load(adapter);

    await a.createTree("a", "A");
    await b.createTree("b", "B");

    const reloaded = await ForestStore.load(adapter);
    expect(reloaded.listTrees().map((t) => t.title).sort()).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/core/forest-store.test.ts`
Expected: FAIL — `b`'s index was read before `A` existed, so writing it drops `A`.

- [ ] **Step 3: Re-read before writing**

In `packages/core/src/forest-store.ts`, replace `persistIndex` and the three call sites with a
mutator that starts from the stored index:

```ts
  /**
   * Apply a change to the forest index, re-reading the stored index first so a
   * second tab (another ForestStore over the same storage) does not lose
   * entries it added since this one loaded.
   */
  private async mutateIndex(
    mutate: (current: ForestIndex) => ForestIndex,
  ): Promise<void> {
    const current =
      (await this.adapter.readForestIndex()) ?? { version: 1, activeTreeId: null, trees: [] };
    this.index = mutate(current);
    await this.adapter.writeForestIndex(this.index);
  }
```

`setActiveTree`:

```ts
    await this.mutateIndex((current) => ({ ...current, activeTreeId: id }));
```

`createTree`:

```ts
    await this.mutateIndex((current) => ({
      trees: [...current.trees, treeId],
      activeTreeId: treeId,
    }));
```

`deleteTree`:

```ts
    await this.mutateIndex((current) => {
      const remaining = current.trees.filter((t) => t !== id);
      const activeTreeId = current.activeTreeId === id ? remaining[0] ?? null : current.activeTreeId;
      return { trees: remaining, activeTreeId };
    });
```

Delete the now-unused `persistIndex`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/core` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/forest-store.ts tests/core/forest-store.test.ts
git commit -m "Re-read the forest index before writing it"
```

---

### Task 3: Shared "load failed" dialog

**Files:**
- Create: `apps/web/src/components/LoadNotice.tsx`
- Modify: `apps/web/src/hooks/useTree.tsx`, `apps/web/src/App.tsx`, `apps/web/src/components/AppHeader.tsx`, `apps/web/src/components/DualPanel.tsx`
- Test: `apps/web/src/components/__tests__/LoadNotice.test.tsx`, `apps/web/src/hooks/__tests__/useTree.test.tsx`, `apps/web/src/components/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Produces: `LoadNotice({ message, onClose })`; context gains `loadNotice: string | null` and `setLoadNotice(m: string | null)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/__tests__/LoadNotice.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LoadNotice } from "../LoadNotice";

describe("LoadNotice", () => {
  it("shows the message and dismisses", () => {
    const onClose = vi.fn();
    render(<LoadNotice message="This file is not a valid PDF." onClose={onClose} />);
    expect(screen.getByText("This file is not a valid PDF.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ok/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

In `apps/web/src/hooks/__tests__/useTree.test.tsx`, add to `Probe`:
`<span data-testid="notice">{loadNotice ?? "none"}</span>` and a button calling
`setLoadNotice("boom")`, then assert the span becomes `boom`.

In `apps/web/src/components/__tests__/AppHeader.test.tsx`, add `setLoadNotice: vi.fn()` to the
mock context and:

```tsx
  it("reports a failed open through the shared notice", async () => {
    const setLoadNotice = vi.fn();
    mocks.ctx = { ...baseCtx(), setLoadNotice };
    const { container } = render(<AppHeader onSettings={() => {}} onToggleSidebar={() => {}} />);
    const input = container.querySelector(
      'header input[accept=".md,.markdown,.txt,.docx,.pdf"]',
    ) as HTMLInputElement;
    const file = new File(["x"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(setLoadNotice).toHaveBeenCalled());
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test apps/web/src/components/__tests__/LoadNotice.test.tsx`
Expected: FAIL — cannot resolve `../LoadNotice`.

- [ ] **Step 3: Implement the dialog**

Create `apps/web/src/components/LoadNotice.tsx`:

```tsx
interface Props { message: string; onClose: () => void; }

/** Shared notice for a document that could not be opened (web file opens and extension clips). */
export function LoadNotice({ message, onClose }: Props) {
  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2 style={{ marginBottom: 12 }}>Could not open this document</h2>
        <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 20, lineHeight: 1.6 }}>{message}</p>
        <div className="btn-row">
          <button onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the context state and render the dialog**

In `apps/web/src/hooks/useTree.tsx`: add `loadNotice: string | null` and
`setLoadNotice: (m: string | null) => void` to `TreeContextValue`, a
`const [loadNotice, setLoadNotice] = useState<string | null>(null)`, and pass both in the value.

In `apps/web/src/App.tsx` `AppContent`, render it inside the provider tree:

```tsx
      {loadNotice && <LoadNotice message={loadNotice} onClose={() => setLoadNotice(null)} />}
```

- [ ] **Step 5: Route failures to it**

`AppHeader.handleLoadFile` catch block becomes `setLoadNotice((e as Error).message)` and drops the
`alert` (destructure `setLoadNotice` from `useTree`). In `DualPanel`'s empty-state
`handleOpenFile` catch, call `setLoadNotice((err as Error).message)` as well.

- [ ] **Step 6: Run to verify they pass**

Run: `pnpm test` → PASS. Run: `pnpm lint` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/LoadNotice.tsx apps/web/src/components/__tests__/LoadNotice.test.tsx apps/web/src/hooks/useTree.tsx apps/web/src/hooks/__tests__/useTree.test.tsx apps/web/src/App.tsx apps/web/src/components/AppHeader.tsx apps/web/src/components/DualPanel.tsx apps/web/src/components/__tests__/AppHeader.test.tsx
git commit -m "Add a shared load-failed dialog for the app and the extension"
```

---

### Task 4: Extension package and clip normalisation

**Files:**
- Create: `apps/extension/package.json`, `apps/extension/src/clip.ts`, `apps/extension/src/__tests__/clip.test.ts`

**Interfaces:**
- Produces: `clipDocument(doc: Document, url: string): { title: string; markdown: string; url: string } | null`.

- [ ] **Step 1: Create the package**

`apps/extension/package.json`:

```json
{
  "name": "@asktree/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs"
  },
  "dependencies": {
    "@asktree/core": "workspace:*",
    "defuddle": "0.19.4"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "typescript": "^5.5",
    "vite": "^5.4.0"
  }
}
```

Then `pnpm install`.

- [ ] **Step 2: Write the failing test**

`apps/extension/src/__tests__/clip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clipDocument } from "../clip";

function page(html: string, title = "My Page"): Document {
  const doc = document.implementation.createHTMLDocument(title);
  doc.body.innerHTML = html;
  return doc;
}

describe("clipDocument", () => {
  it("produces a titled document with a source header", () => {
    const clip = clipDocument(
      page("<article><h1>Hello</h1><p>" + "Real content here. ".repeat(40) + "</p></article>"),
      "https://example.com/post",
    );
    expect(clip).not.toBeNull();
    expect(clip!.title).toBe("My Page");
    expect(clip!.markdown).toContain("# My Page");
    expect(clip!.markdown).toContain("> Source: https://example.com/post");
    expect(clip!.markdown).toContain("Real content here.");
  });

  it("returns null when there is nothing to clip", () => {
    expect(clipDocument(page("<p></p>"), "https://example.com/empty")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test apps/extension/src/__tests__/clip.test.ts`
Expected: FAIL — cannot resolve `../clip`.

- [ ] **Step 4: Implement it**

`apps/extension/src/clip.ts`:

```ts
import Defuddle from "defuddle";

export interface Clip {
  title: string;
  url: string;
  markdown: string;
}

/**
 * Turn a page into a document. Defuddle extracts the main content and emits
 * Markdown itself (and already falls back to the whole body when it finds no
 * article). Returns null when there is nothing usable to clip.
 */
export function clipDocument(doc: Document, url: string): Clip | null {
  const result = new Defuddle(doc, { url, markdown: true, separateMarkdown: true }).parse();
  const body = (result.contentMarkdown ?? "").trim();
  if (!body) return null;

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep the raw url
  }
  const title = (result.title || doc.title || host).trim() || host;
  const date = new Date().toISOString().slice(0, 10);

  return {
    title,
    url,
    markdown: `# ${title}\n\n> Source: ${url} — ${date}\n\n${body}`,
  };
}
```

If Defuddle cannot run under jsdom, report it and keep the assertion by loading the HTML into a
real document via `document.implementation.createHTMLDocument` (already used above) — do not
mock Defuddle.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test apps/extension/src/__tests__/clip.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension
git commit -m "Add the extension package and page-to-Markdown clipping"
```

---

### Task 5: The clip bridge in the app

**Files:**
- Create: `apps/web/src/extension/chrome-like.ts`, `apps/web/src/extension/pending-clip.ts`, `apps/web/src/extension/ClipBridge.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/extension/__tests__/pending-clip.test.ts`

**Interfaces:**
- Produces: `type PendingClip`; `getChrome(): ChromeLike | null`; `clipIdFromSearch(search: string): string | null`; `takePendingClip(id: string, chrome: ChromeLike): Promise<PendingClip | null>`; `<ClipBridge/>`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/extension/__tests__/pending-clip.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { clipIdFromSearch, takePendingClip, type ChromeLike } from "../pending-clip";

function fakeChrome(clips: Record<string, unknown>) {
  return {
    runtime: { id: "test" },
    storage: {
      session: {
        get: vi.fn(async () => ({ clips })),
        set: vi.fn(async () => {}),
      },
    },
  } as unknown as ChromeLike;
}

describe("pending-clip", () => {
  it("reads the clip id from the query string", () => {
    expect(clipIdFromSearch("?clip=abc")).toBe("abc");
    expect(clipIdFromSearch("?x=1&clip=abc")).toBe("abc");
    expect(clipIdFromSearch("?x=1")).toBeNull();
  });

  it("takes a clip and clears only that entry", async () => {
    const chrome = fakeChrome({
      abc: { kind: "markdown", title: "T", markdown: "M" },
      def: { kind: "error", message: "other" },
    });
    const clip = await takePendingClip("abc", chrome);
    expect(clip).toEqual({ kind: "markdown", title: "T", markdown: "M" });
    const written = chrome.storage!.session.set.mock.calls[0][0] as { clips: Record<string, unknown> };
    expect(Object.keys(written.clips)).toEqual(["def"]);
  });

  it("returns null for an unknown id", async () => {
    const chrome = fakeChrome({});
    expect(await takePendingClip("missing", chrome)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test apps/web/src/extension/__tests__/pending-clip.test.ts`
Expected: FAIL — cannot resolve `../pending-clip`.

- [ ] **Step 3: Implement the module**

`apps/web/src/extension/chrome-like.ts`:

```ts
export interface ChromeLike {
  runtime?: { id?: string };
  storage?: {
    session: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
}

/** The extension APIs, or null when the app runs as a normal web page. */
export function getChrome(): ChromeLike | null {
  const maybe = (globalThis as { chrome?: ChromeLike }).chrome;
  return maybe?.runtime?.id && maybe.storage ? maybe : null;
}
```

`apps/web/src/extension/pending-clip.ts`:

```ts
import type { ChromeLike } from "./chrome-like";

export type PendingClip =
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "pdf"; title: string; assetId: string }
  | { kind: "error"; message: string };

export function clipIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("clip");
}

/** Read and clear the pending clip with this id. */
export async function takePendingClip(id: string, chrome: ChromeLike): Promise<PendingClip | null> {
  const store = chrome.storage!.session;
  const stored = await store.get(["clips"]);
  const clips = (stored.clips as Record<string, PendingClip> | undefined) ?? {};
  const clip = clips[id] ?? null;
  if (clip) {
    delete clips[id];
    await store.set({ clips });
  }
  return clip;
}
```

- [ ] **Step 4: Implement the bridge component**

`apps/web/src/extension/ClipBridge.tsx`:

```tsx
import { useEffect } from "react";
import { IndexedDBStorageAdapter } from "@asktree/core";
import { useTree } from "../hooks/useTree";
import { getChrome } from "./chrome-like";
import { clipIdFromSearch, takePendingClip } from "./pending-clip";

/** Consumes a pending clip when the app is opened by the extension. No-op in the web app. */
export function ClipBridge() {
  const { createDocument, setLoadNotice } = useTree();

  useEffect(() => {
    const chrome = getChrome();
    if (!chrome) return;
    const id = clipIdFromSearch(window.location.search);
    if (!id) return;

    (async () => {
      const clip = await takePendingClip(id, chrome);
      if (!clip) return;
      if (clip.kind === "markdown") {
        await createDocument(clip.markdown, clip.title);
      } else if (clip.kind === "pdf") {
        const adapter = new IndexedDBStorageAdapter();
        const blob = await adapter.readAsset(clip.assetId);
        if (blob) {
          await createDocument("", clip.title, "pdf", blob);
          await adapter.deleteAsset(clip.assetId).catch(() => {});
        } else {
          setLoadNotice("The clipped PDF could not be read.");
        }
      } else {
        setLoadNotice(clip.message);
      }
    })();
  }, [createDocument, setLoadNotice]);

  return null;
}
```

Render `<ClipBridge />` in `App.tsx`'s `AppContent` (inside the provider).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test apps/web/src/extension/__tests__/pending-clip.test.ts` → PASS.
Run: `pnpm test && pnpm lint` → PASS / 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/extension apps/web/src/App.tsx
git commit -m "Consume a pending clip when the extension opens the app"
```

---

### Task 6: Service worker, content script, manifest and build

**Files:**
- Create: `apps/extension/manifest.json`, `apps/extension/src/background.ts`, `apps/extension/src/content.ts`, `apps/extension/scripts/make-icons.mjs`, `apps/extension/scripts/build.mjs`
- Modify: `apps/web/vite.config.ts`, `package.json`

**Interfaces:**
- Consumes: `clipDocument` (Task 4), `IndexedDBStorageAdapter` (Task 1), the pending-clip shape (Task 5, `clips[id]`).
- Produces: an unpacked extension in `apps/extension/dist` and `globalThis.__asktreeClipActiveTab(tab)` for tests.

- [ ] **Step 1: Manifest**

`apps/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "AskTree",
  "version": "0.1.0",
  "description": "Clip a page or PDF into an AskTree forest and ask about it.",
  "action": { "default_title": "Clip to AskTree" },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["activeTab", "scripting", "storage"],
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

- [ ] **Step 2: Icons**

`apps/extension/scripts/make-icons.mjs` writes simple PNGs (brand-blue triangle over a circle)
using Node's `zlib` — a minimal PNG encoder. Run it once and commit the output:

```js
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = size / 2;
      const insideTriangle = y > size * 0.22 && y < size * 0.62 && Math.abs(x - cx) < (y - size * 0.22) * 0.9;
      const insideCircle = (x - cx) ** 2 + (y - size * 0.72) ** 2 < (size * 0.2) ** 2;
      const on = insideTriangle || insideCircle;
      raw[i] = 0x58; raw[i + 1] = 0xa6; raw[i + 2] = 0xff; raw[i + 3] = on ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../icons");
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(resolve(out, `${size}.png`), png(size));
console.log("wrote extension icons");
```

Run: `node apps/extension/scripts/make-icons.mjs` and confirm four PNGs exist.

- [ ] **Step 3: Content script**

`apps/extension/src/content.ts` — bundled as an IIFE; it publishes a global that the background
reads in a second `executeScript` call (the function form cannot carry imports):

```ts
import { clipDocument } from "./clip";

declare global {
  // eslint-disable-next-line no-var
  var __asktreeClipResult: unknown;
}

globalThis.__asktreeClipResult = clipDocument(document, location.href) ?? { error: true };
```

- [ ] **Step 4: Service worker**

`apps/extension/src/background.ts`:

```ts
import { IndexedDBStorageAdapter } from "@asktree/core";

const APP_PAGE = "index.html";

type PendingClip =
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "pdf"; title: string; assetId: string }
  | { kind: "error"; message: string };

function isPdf(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

async function stash(clip: PendingClip): Promise<string> {
  const id = crypto.randomUUID();
  const stored = await chrome.storage.session.get(["clips"]);
  const clips = (stored.clips as Record<string, PendingClip>) ?? {};
  clips[id] = clip;
  await chrome.storage.session.set({ clips });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`${APP_PAGE}?clip=${id}`) });
  return id;
}

export async function clipActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) return;
  try {
    if (isPdf(tab.url)) {
      const response = await fetch(tab.url); // activeTab grants this origin
      const bytes = await response.arrayBuffer();
      const adapter = new IndexedDBStorageAdapter();
      const assetId = crypto.randomUUID();
      await adapter.writeAsset(assetId, new Blob([bytes], { type: "application/pdf" }));
      const title = tab.title || decodeURIComponent(new URL(tab.url).pathname.split("/").pop() || "PDF");
      await stash({ kind: "pdf", title, assetId });
      return;
    }

    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ["content.js"] });
    // The content script may not have run (e.g. chrome:// pages): executeScript throws first.
    const injection = await chrome.scripting.executeScript({
      target,
      func: () => (globalThis as { __asktreeClipResult?: unknown }).__asktreeClipResult,
    });
    const result = injection[0]?.result as { error?: true; title?: string; markdown?: string } | undefined;
    if (!result || result.error || !result.markdown) {
      await stash({ kind: "error", message: "Could not read this page's content." });
      return;
    }
    await stash({ kind: "markdown", title: result.title ?? tab.title ?? "Untitled", markdown: result.markdown });
  } catch (e) {
    await stash({ kind: "error", message: `Could not clip this page: ${(e as Error).message}` });
  }
}

chrome.action.onClicked.addListener((tab) => {
  void clipActiveTab(tab);
});

// Exposed so the end-to-end test can invoke the same handler the action does.
(globalThis as { __asktreeClipActiveTab?: unknown }).__asktreeClipActiveTab = clipActiveTab;
```

- [ ] **Step 5: Type-check the extension**

Create `apps/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["chrome"], "noEmit": true, "lib": ["ES2022", "DOM", "WebWorker"] },
  "include": ["src", "scripts"]
}
```

Extend the root `lint` script so the extension is type-checked too:

```json
"lint": "tsc -p packages/core/tsconfig.json --noEmit && tsc -p apps/web/tsconfig.json --noEmit && tsc -p apps/extension/tsconfig.json --noEmit"
```

Run: `pnpm lint` → 0 errors.

- [ ] **Step 6: Web extension build mode**

In `apps/web/vite.config.ts`, make the base depend on the mode:

```ts
  const isExtension = mode === "extension";
  return {
    base: isExtension ? "./" : "/askTree/",
    // ...the rest unchanged
  };
```

- [ ] **Step 7: Build script**

`apps/extension/scripts/build.mjs` runs the web app's extension build, bundling the service
worker and content script, and copies everything next to the manifest:

```js
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

// 1. The app itself, in extension mode (relative base).
execFileSync("pnpm", ["--filter", "@asktree/web", "exec", "vite", "build", "--mode", "extension"], {
  stdio: "inherit",
  cwd: resolve(root, "../.."),
});

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, "../web/dist"), dist, { recursive: true });

// 2. background (ES module) and content (IIFE) bundles.
await build({
  root,
  build: {
    outDir: dist,
    emptyOutDir: false,
    lib: { entry: resolve(root, "src/background.ts"), formats: ["es"], fileName: () => "background.js" },
  },
});
await build({
  root,
  build: {
    outDir: dist,
    emptyOutDir: false,
    lib: { entry: resolve(root, "src/content.ts"), formats: ["iife"], name: "__asktreeContent", fileName: () => "content.js" },
  },
});

copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
console.log("extension built into", dist);
```

Add a root script: `"build:extension": "pnpm --filter @asktree/extension build"`.

- [ ] **Step 8: Verify it builds**

Run: `pnpm --filter @asktree/web build && pnpm build:extension` → `apps/extension/dist` contains
`manifest.json`, `background.js`, `content.js`, `index.html`, `assets/`, `pdfjs/`, `icons/`.

Run: `pnpm lint` → 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/extension apps/web/vite.config.ts package.json
git commit -m "Build the extension: manifest, worker, content script and assets"
```

---

### Task 7: End-to-end and full verification

**Files:**
- Create: `e2e/extension.spec.ts`, `apps/web/public/e2e-clip-fixture.html`

**Interfaces:**
- Consumes: `apps/extension/dist` and `globalThis.__asktreeClipActiveTab`.

- [ ] **Step 1: Add the fixture page**

`apps/web/public/e2e-clip-fixture.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Clipped Article</title></head>
  <body>
    <article>
      <h1>Clipped Article</h1>
      <p id="body">This is the article body, long enough that content extraction keeps it. </p>
    </article>
  </body>
</html>
```

(duplicate the paragraph a few times so extraction treats it as the main content).

- [ ] **Step 2: Write the test**

`e2e/extension.spec.ts`:

```ts
import { test as base, chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

const EXT = resolve(__dirname, "../apps/extension/dist");

const test = base.extend<{ context: import("@playwright/test").BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
  },
});

test("clips a page into a new tab's forest", async ({ context }) => {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  // A real HTTP page served by the dev server: content scripts cannot run on data: URLs.
  const page = await context.newPage();
  await page.goto("http://localhost:5173/askTree/e2e-clip-fixture.html");

  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    await (globalThis as { __asktreeClipActiveTab?: (t: unknown) => Promise<void> }).__asktreeClipActiveTab?.(tabs[0]);
  });

  const app = await context.waitForEvent("page");
  await app.waitForLoadState();
  await expect(app.locator(".doc-row")).toHaveCount(1);
  await expect(app.locator(".doc-row")).toContainText("Clipped Article");
  expect(app.url()).toContain(`chrome-extension://${extensionId}/index.html`);
});
```

- [ ] **Step 3: Install a browser that supports extensions**

Run: `pnpm exec playwright install chromium`.
**Environment caveat:** extensions need the full Chromium, not the headless shell, and the
download was unreliable in this environment earlier. If the install cannot complete, stop and
report it: keep the unit coverage, and record that the extension E2E is not runnable here (the
manual check is: load `apps/extension/dist` unpacked, click the icon, confirm a tab opens).

- [ ] **Step 4: Run it**

Run: `pnpm test:e2e --reporter=list e2e/extension.spec.ts`
Expected: 1 passed. If the browser cannot be installed, report the blocker instead of claiming
success.

- [ ] **Step 5: Full verification**

Run: `pnpm test` → all pass.
Run: `pnpm lint` → 0 errors.
Run: `pnpm build && pnpm build:extension` → exit 0.
Run: `pnpm test:e2e --reporter=list` → all pass (existing suites + the extension test).

- [ ] **Step 6: Commit**

```bash
git add e2e/extension.spec.ts apps/web/public/e2e-clip-fixture.html
git commit -m "Add an end-to-end test that clips a page through the extension"
```

---

## Self-Review

- **Spec coverage:** the adapter move (Task 1); race-safe index (Task 2); shared load-failure
  dialog wired into the web file-open paths (Task 3); the extension package and Defuddle-based
  clipping with a source header (Task 4); the feature-detected `ClipBridge` and pending-clip
  handoff (Task 5); the MV3 manifest with minimal permissions, the service worker (PDF fetch →
  shared assets store), the content script, the extension build mode and packaging (Task 6); an
  unpacked-extension E2E and full verification (Task 7). The spec's known limitation (Playwright
  cannot click the toolbar) is handled by invoking the action's handler from the service worker.
- **Placeholders:** none.
- **Type consistency:** `clipDocument`, `Clip`, `PendingClip`, `takePendingClip`,
  `clipIdFromSearch`, `getChrome`, `ChromeLike`, `LoadNotice`, `loadNotice`/`setLoadNotice`,
  `IndexedDBStorageAdapter`, `__asktreeClipActiveTab`, `clips` are used identically across tasks.

## Deviations to note for the implementer

- The spec named Turndown for the page conversion; Defuddle emits Markdown itself, so Turndown is
  not used for clipping (it remains in the Word import). The spec was updated to match.
- The exported `content.js` scene (an IIFE that publishes a global) is a deliberate choice so the
  background can read its result with a second `executeScript` (a function cannot carry imports).
