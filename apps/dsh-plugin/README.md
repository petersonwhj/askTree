# asktree-dsh

AskTree as a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: the
tree-of-questions study panel, inside the Harness Web GUI.

This is **phase A** - the panel runs the existing AskTree application and owns its own storage and
LLM endpoint. Wiring it to the Harness model, its storage, and agent tools is phase B.

## What it contributes

One Loader row (`asktree-dsh`) with both halves:

| Half | File | What it does |
| --- | --- | --- |
| Host | `lib/index.js` | Serves the pdf.js runtime assets under `/pdfjs`. Optionally publishes rebuilt browser bundles. |
| Browser | `lib/client.js` | Registers the AskTree panel in the `main` keyed slot and its icon in `sidebar.panellist`. |

The browser half is one self-contained CJS closure factory, the artifact shape the Harness
client-module loader fetches from `GET /plugins/??asktree-dsh/client.js&rev=<rev>`.

### Why the panel renders in the light DOM

The first version mounted the app in a shadow root to contain `App.css` (it resets `*` and
restyles `body`). That broke the product's core interaction: Chromium **retargets**
`window.getSelection()` nodes to the shadow host, so the app's own selection handler -
`container.contains(selection.anchorNode)` in `MarkdownPane.tsx` - never matched, and the floating
"Ask about ..." button never appeared. Range/TreeWalker offset mapping, clipboard and the file
pickers are shadow-sensitive in the same way.

Containment therefore moved to the stylesheet. `scripts/build.mjs` runs `App.css` and KaTeX's
sheet through postcss and prefixes every style rule with the panel's scope class:

- `body`, `html`, `:root` and `#root` rules are remapped onto `.asktree-dsh-scope`;
- `@font-face` and `@keyframes` keep their selectors, because they only define names;
- KaTeX's `woff`/`truetype` fallbacks are dropped and every remaining `woff2` is inlined as a data
  URI, so the single served bundle has no external references;
- the whole sheet travels as a string inside `client.js`, so CSS can never become a sibling asset
  the loader would not serve.

Every build asserts the result, so an unscoped rule fails the build instead of restyling the
Harness:

```
asktree-dsh built (externals: react, react-dom/client, react/jsx-runtime, url):
  lib/index.js  2.1 KiB
  lib/client.js  3680.6 KiB
```

## Build

```sh
pnpm --filter asktree-dsh build      # -> lib/index.js + lib/client.js
pnpm --filter asktree-dsh sync:win   # copy the artifact to a Windows-visible path
```

`scripts/build.mjs` reimplements the bundle shape instead of reusing a preset, because the Harness
`clientBundle` tsdown preset is not published. Besides the stylesheet checks above it asserts that
`client.js` is the only artifact (dynamic imports are inlined, since the loader fetches one
resource per package), that the loader banner/footer wrap the factory under the package name, and
that the baseline platform modules stayed external `require(...)` calls rather than inlining a
second React.

## Test

```sh
pnpm --filter asktree-dsh test       # everything below, in order
```

Three layers, none of which needs the Harness or a model:

1. **`verify`** - checks both built halves. The browser half (`verify-client.mjs`) loads the real
   `lib/client.js` in a jsdom realm behind a stubbed `window.__ModuleLoader__`, runs `apply` against
   a recording slot registry, renders the panel it registers, and checks the loader contract, both
   slot registrations, the scoped stylesheet, and that the AskTree application actually mounts. The
   host half (`verify-host.mjs`) mounts the real `lib/index.js` against a recording Web-server
   service and drives the `/pdfjs` handler with mock requests: served bytes and content type, HEAD,
   404, 405, a refused directory, and a refused traversal. 23 assertions.
2. **`build:harness`** - builds `tests/e2e/dist/`, a page that serves the real `client.js` through a
   stand-in Harness loader plus a bundled React for the module table.
3. **`test:e2e`** - 27 Playwright specs driving that page in real Chromium. The model is stubbed at
   the HTTP boundary (`page.route`) and the endpoint is seeded through
   `localStorage.asktree_llm_config`, so the real prompt assembly, request shape and rendering path
   all run. Coverage follows the release notes: select-to-ask, recursive drill-down, breadcrumbs,
   suggested questions (ask / refresh / dismiss / inspect), free ask with Left/Right, prompt debug,
   resolved status, the explored underline, copy/download Markdown, the forest (switch, `＋ New`,
   rename, delete with confirmation, export/import round trip, per-document isolation), LaTeX in
   both delimiter styles, `.docx` conversion, image/vision asks, the PDF viewer (paging, page jump,
   zoom, fit width, crop-to-ask with three image parts), and reading-position restore after a
   reload.

On a bare Linux image run `pnpm --filter asktree-dsh e2e:setup` once: Chromium links
`libasound.so.2`, which slim images omit and which needs root to install. The script fetches the
package as an ordinary user and extracts it into `.browser-libs/`, which the Playwright config puts
on the browser's `LD_LIBRARY_PATH`.

## One upstream fix

The panel bundles the app as it is, with a single exception. PDF crop-to-ask targeted the
*currently active* node rather than the page the crop came from: a crop is not a text selection, so
`DualPanel.handleSendQuestion` fell through to `freeAskTarget`, whose default is the right-hand
(active) pane, and the ◀ Left / Right ▶ toggle is unreachable while a crop is staged because staging
one replaces the free-ask row with the context row. A second crop therefore landed under the
previous answer, and because the target was then no longer the PDF root, the crop was dropped and
the question went out as plain text about the answer.

`apps/web/src/components/DualPanel.tsx` now pins a staged crop to the PDF viewer's own page. This
is an upstream fix: it corrects the hosted web app and the Chrome extension too, and
`tests/e2e/pdf.spec.ts` guards it.

## Install into a profile

Build the artifact first:

```sh
pnpm --filter asktree-dsh build
```

`lib/` is git-ignored, and the Harness installs a plugin as a local directory, so the installer
needs an absolute path it can read. When the checkout and the Harness live on different filesystems
(for example a WSL checkout and a Windows Harness), copy the built package to a path the Harness can
see:

```sh
ASKTREE_DSH_DEST=/mnt/d/asktree-dsh-plugin pnpm --filter asktree-dsh sync:win
```

Then install from the Harness side, naming that absolute path:

```
plugin_manager action=install_bundle target="D:\\asktree-dsh-plugin"
```

or, from a `dsh` CLI install on the same filesystem as the checkout:

```sh
dsh plugin --profile <name> add "$PWD/apps/dsh-plugin"
```

An **AskTree** icon appears in the sidebar rail, between *Schedules* and the settings entry.

The package is marked `private` deliberately: it cannot be installed from npm yet, because its
build reads `apps/web` and `packages/core` from this monorepo. Distribution outside the monorepo
is not set up.

### Development reload

Adding a bundle row hot-loads the client graph, but changed bundle *bytes* reach the page only
through `ctx.clientModules.rebuilt()`. Set the row's `devWatch` config to have the host half poll
the build and publish it:

```yaml
- id: asktree
  name: asktree-dsh
  config:
    devWatch: true
```

With that on, `build` + `sync:win` reaches an open page in about two seconds.

## Current limits

- **LLM access is the panel's own.** Configure an endpoint (Ollama / OpenAI-compatible / Anthropic)
  in the panel's Settings, exactly as on the AskTree web app. The Harness model and its credentials
  are not used yet.
- **Storage is the browser's IndexedDB**, under the Harness origin. Trees do not live in the
  workspace and are not visible to the agent.
- **A host-half change needs a Harness restart.** The browser half reloads through
  `ctx.clientModules.rebuilt()`, but the host half is an ordinary module the running process has
  already imported, so a new `/pdfjs` route (or any host-side edit) only appears after a restart.
- **The pdf.js assets add ~4.7 MiB to the installed package.** They sit beside the bundle in
  `lib/pdfjs/` and are served from disk, not bundled into the page.
- **Styling is AskTree's own dark theme**, not Harness theme tokens, so the panel does not follow
  the Harness light/dark switch.

## Phase B sketch

1. Serve the panel's LLM calls from the host half through `ctx.llm.stream()`, so the panel uses the
   Harness model and credentials instead of a second endpoint config.
2. Move tree storage behind the host half (`ctx.storageDomain` or the workspace) and keep
   `StorageAdapter` as the seam - the one interface `@asktree/core` already exposes.
3. Register `asktree_*` tools so the agent can read and extend the tree the panel is showing.