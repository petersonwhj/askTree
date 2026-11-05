/**
 * Build both halves of the `asktree-dsh` bundle.
 *
 * Host half: `src/host/index.js` is dependency-free ESM, so it is copied
 * verbatim to `lib/index.js` - no bundler and nothing to resolve.
 *
 * Browser half: the Harness client-module loader does not run a bundler in the
 * page. It fetches exactly one pre-built CJS "closure factory" per package -
 * `GET /plugins/??<pkg>/client.js&rev=<rev>` - and hands the factory a `require`
 * backed by the shared module table. So this script reproduces that artifact
 * itself (the in-repo `clientBundle` tsdown preset is not published):
 *
 *   - ONE self-contained CJS bundle at `lib/client.js`. Dynamic imports are
 *     inlined because the loader serves a single resource per package, so a
 *     sibling chunk could never be fetched.
 *   - Every baseline platform module stays an external `require(...)`, so React
 *     and the Cordis instance are the shell's single copies.
 *   - The loader's banner/intro/footer wrap the bundle in the factory.
 *   - CSS never becomes a sibling asset. The panel renders in the light DOM, so
 *     the app's whole-document stylesheets are SCOPED here - every rule is
 *     prefixed with the panel scope class by postcss - and travel inside
 *     client.js as a string. `body`, `html` and `#root` rules are remapped onto
 *     the scope root; `@font-face` and `@keyframes` stay unprefixed because they
 *     only define names; KaTeX's fonts are inlined as data URIs so the sheet has
 *     no external references.
 *
 * @module asktree-dsh/scripts/build
 */
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const repo = resolve(root, '..', '..')
const libDir = join(root, 'lib')

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const id = pkg.name

const CORE_ENTRY = join(repo, 'packages', 'core', 'src', 'index.ts')
const WEB_SRC = join(repo, 'apps', 'web', 'src')
const APP_CSS = join(WEB_SRC, 'App.css')
const PANEL_CSS = join(root, 'src', 'client', 'panel.css')
const KATEX_CSS = require.resolve('katex/dist/katex.min.css')

/**
 * The panel bundles apps/web, so apps/web's manifest is what resolves pdf.js.
 * Anchoring the require there reuses the app's own pinned version instead of
 * adding a second copy to this package.
 */
const webRequire = createRequire(join(repo, 'apps', 'web', 'package.json'))
const PDFJS_ROOT = dirname(webRequire.resolve('pdfjs-dist/package.json'))

/** pdf.js directories the viewer fetches at runtime. */
const PDF_ASSET_DIRS = ['wasm', 'cmaps', 'standard_fonts']

/** Class that owns every rule the app contributes in the light DOM. */
const SCOPE = '.asktree-dsh-scope'

/** Virtual module the browser half imports for its stylesheet string. */
const STYLE_MODULE = 'virtual:asktree-app-css'
const STYLE_MODULE_RESOLVED = `\0${STYLE_MODULE}`

/**
 * Shared browser platform modules, mirrored from
 * `packages/client/web/src/platform.ts` of the Harness checkout. These MUST stay
 * externals: inlining React or Cordis would give the page a second instance.
 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** `, url(...woff) format("woff")` / the truetype twin, which woff2 makes redundant. */
const NON_WOFF2_SOURCE = /,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\((["']?)(?:woff|truetype)\1\)/g

/** One `url(...)` reference inside a stylesheet. */
const CSS_URL = /url\((["']?)([^"')]+)\1\)/g

/** At-rules whose contents are name definitions, not style rules. */
const NAME_DEFINING_AT_RULES = new Set(['font-face', 'page', 'property', 'counter-style'])

/**
 * Rewrite one selector so it can only match inside the panel.
 * @param selector - a single selector (no commas).
 * @returns the scoped selector.
 */
function scopeOneSelector(selector) {
  const trimmed = selector.trim()
  if (trimmed === '') return trimmed
  // Whole-document roots: the panel's own root element stands in for them.
  if (/^(?::root|html|body|#root)$/.test(trimmed)) return SCOPE
  return `${SCOPE} ${trimmed}`
}

/**
 * Prefix every style rule of a whole-document stylesheet with the scope class.
 *
 * `@font-face` and `@keyframes` keep their selectors: they define a name for the
 * whole document and cannot leak a declaration. Everything nested in `@media`
 * and friends is scoped normally.
 * @param css - the stylesheet text.
 * @returns the scoped stylesheet text.
 */
function scopeStylesheet(css) {
  const parsed = postcss.parse(css)
  parsed.walkRules((rule) => {
    const parent = rule.parent
    if (parent !== undefined && parent.type === 'atrule') {
      const name = parent.name.toLowerCase()
      if (name.endsWith('keyframes') || NAME_DEFINING_AT_RULES.has(name)) return
    }
    rule.selector = rule.selectors.map(scopeOneSelector).join(', ')
  })
  return parsed.toString()
}

/**
 * Drop the redundant woff/truetype sources and inline every remaining woff2
 * file as a data URI, so the single served bundle has no external references.
 * @param css - KaTeX's stylesheet text.
 * @returns the stylesheet with fonts embedded.
 */
function inlineKatexFonts(css) {
  const baseDir = dirname(KATEX_CSS)
  const cache = new Map()
  return css.replace(NON_WOFF2_SOURCE, '').replace(CSS_URL, (match, _quote, spec) => {
    if (spec.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(spec)) return match
    if (!spec.endsWith('.woff2')) return match
    const file = resolve(baseDir, spec)
    let encoded = cache.get(file)
    if (encoded === undefined) {
      try {
        encoded = readFileSync(file).toString('base64')
      } catch {
        return match
      }
      cache.set(file, encoded)
    }
    return `url(data:font/woff2;base64,${encoded})`
  })
}

/**
 * The panel's complete stylesheet: the already-namespaced panel frame, the
 * scoped AskTree sheet, and scoped KaTeX with its fonts embedded.
 *
 * Computed once, outside the bundler, so the assertions below can inspect the
 * exact text the browser will inject instead of grepping the finished bundle.
 */
const SHEET = [
  readFileSync(PANEL_CSS, 'utf8'),
  scopeStylesheet(readFileSync(APP_CSS, 'utf8')),
  scopeStylesheet(inlineKatexFonts(readFileSync(KATEX_CSS, 'utf8'))),
].join('\n')

/**
 * Serve the panel's stylesheet as a module.
 * @param sheet - the fully scoped stylesheet.
 * @returns a Vite plugin.
 */
function appStylesheet(sheet) {
  return {
    name: 'asktree-app-stylesheet',
    resolveId(source) {
      return source === STYLE_MODULE ? STYLE_MODULE_RESOLVED : null
    },
    load(source) {
      if (source !== STYLE_MODULE_RESOLVED) return null
      return `export default ${JSON.stringify(sheet)}`
    },
  }
}

/**
 * Neutralize side-effect CSS imports. `App.tsx` imports `./App.css` for its side
 * effect; the panel imports the same sheet through the scoped virtual module.
 * Without this the sheet would also be emitted as document-level CSS in its
 * original, unscoped form - which is exactly what must not happen.
 * @returns a Vite plugin.
 */
function neutralizeSideEffectCss() {
  return {
    name: 'asktree-neutralize-css',
    enforce: 'pre',
    load(source) {
      const [file, query = ''] = source.split('?')
      if (!file.endsWith('.css')) return null
      if (query.split('&').includes('inline')) return null
      return 'export default ""'
    },
  }
}

/** Format a built file's size for the build report. */
async function report(file) {
  const { size } = await stat(file)
  return `${file.slice(root.length + 1)}  ${(size / 1024).toFixed(1)} KiB`
}

await rm(libDir, { recursive: true, force: true })
await mkdir(libDir, { recursive: true })

// --- host half ------------------------------------------------------------
await copyFile(join(root, 'src', 'host', 'index.js'), join(libDir, 'index.js'))

// --- browser half ---------------------------------------------------------
await build({
  configFile: false,
  root,
  base: '/',
  logLevel: 'warn',
  plugins: [react(), neutralizeSideEffectCss(), appStylesheet(SHEET)],
  resolve: {
    alias: [
      { find: /^@asktree\/core$/, replacement: CORE_ENTRY },
      { find: /^@asktree\/web\//, replacement: `${WEB_SRC}/` },
    ],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: libDir,
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    lib: {
      entry: join(root, 'src', 'client', 'index.tsx'),
      formats: ['cjs'],
      fileName: () => 'client.js',
    },
    rollupOptions: {
      external: PLATFORM_MODULES,
      output: {
        exports: 'named',
        inlineDynamicImports: true,
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
        intro: 'var module = { exports: {} }; var exports = module.exports;',
        footer: 'return module.exports; } });',
      },
    },
  },
})

// --- guards ---------------------------------------------------------------
const built = await readdir(libDir)
for (const name of built) {
  if (name === 'index.js' || name === 'client.js' || name === 'client.js.map') continue
  // Static assets the host half serves under /pdfjs.
  if (name === 'pdfjs') continue
  // vite:css-post still emits a stub for the side-effect sheets this build
  // neutralized. The real stylesheet travels inside client.js as a string, so a
  // stub is removable; any artifact carrying actual CSS is a build failure.
  const artifact = await readFile(join(libDir, name), 'utf8')
  if (artifact.includes('{')) {
    throw new Error(`stylesheet ${name} leaked next to the bundle; the loader serves only client.js`)
  }
  await rm(join(libDir, name))
}

const clientPath = join(libDir, 'client.js')
const client = await readFile(clientPath, 'utf8')
const trimmed = client.trimEnd()

if (!client.startsWith('window.__ModuleLoader__.load({')) {
  throw new Error('client.js does not start with the module-loader banner')
}
if (!/return module\.exports;\s*\} \}\);$/.test(trimmed)) {
  throw new Error(`client.js does not end with the module-loader footer; tail: ${trimmed.slice(-120)}`)
}
if (!client.includes(`id: ${JSON.stringify(id)}`)) {
  throw new Error(`client.js is not registered under the package name ${id}`)
}
// Rollup deconflicts the factory parameter against its own CJS `require`, so the
// local name may be `require2`; what matters is that baseline modules stay
// external requests rather than being inlined. Only the specifiers the app
// actually imports can appear - an unused baseline module is simply absent.
const externalRequires = new Set(
  [...client.matchAll(/require\d*\(\s*"([^"]+)"/g)].map((match) => match[1]),
)
for (const required of ['react', 'react/jsx-runtime']) {
  if (!externalRequires.has(required)) {
    throw new Error(`baseline module ${required} was inlined instead of left external`)
  }
}
// pdf.js keeps one Node-only branch behind `typeof document === "undefined"`
// that reaches for `url`; it is unreachable in a browser and the module table
// never answers it, so it is tolerated rather than aliased away.
const TOLERATED_UNREACHABLE = new Set(['url'])
for (const specifier of externalRequires) {
  if (TOLERATED_UNREACHABLE.has(specifier)) continue
  if (specifier.startsWith('.') || specifier.startsWith('node:')) {
    throw new Error(`client.js requests a non-shareable module ${specifier}`)
  }
}
// A second React would carry its own element symbol; the shell's copy is the only one.
if (client.includes('Symbol.for("react.element")') || client.includes("Symbol.for('react.element')")) {
  throw new Error('React appears inlined in client.js')
}

// The stylesheet must be scoped: an unprefixed `body`/`*` rule in the document
// would restyle the Harness itself.
for (const [needle, label] of [
  ['.asktree-dsh-scope .app-header', 'scoped app rules'],
  ['.asktree-dsh-scope .markdown-pane', 'scoped pane rules'],
  ['@font-face', 'KaTeX font faces'],
  ['data:font/woff2;base64,', 'inlined KaTeX fonts'],
]) {
  if (!SHEET.includes(needle)) throw new Error(`the bundled stylesheet is missing ${label}`)
}
if (!client.includes('.asktree-dsh-scope .app-header')) {
  throw new Error('the scoped stylesheet did not make it into client.js')
}
// An unprefixed whole-document rule would restyle the Harness itself. Anchor on a
// rule boundary so class names such as `.app-body` cannot false-positive.
for (const [pattern, label] of [
  [/(?:^|[{};])\s*body\s*\{/, 'unscoped body rule'],
  [/(?:^|[{};])\s*#root\s*\{/, 'unscoped #root rule'],
  [/(?:^|[{};])\s*\*\s*(?:,[^{}]*)?\{/, 'unscoped universal rule'],
]) {
  if (pattern.test(SHEET)) throw new Error(`the bundled stylesheet still contains an ${label}`)
}

/**
 * Copy the pdf.js runtime assets the bundled viewer fetches from `/pdfjs`.
 *
 * They live beside the bundle rather than inside it: the browser loader serves
 * one resource per package, so the worker and its decoders have to be real
 * files the host half can answer with.
 */
async function copyPdfAssets() {
  const out = join(libDir, 'pdfjs')
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  for (const entry of PDF_ASSET_DIRS) {
    await cp(join(PDFJS_ROOT, entry), join(out, entry), { recursive: true })
  }
  await cp(join(PDFJS_ROOT, 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'))
  if (!existsSync(join(out, 'pdf.worker.min.mjs'))) {
    throw new Error('the pdf.js worker was not copied into lib/pdfjs')
  }
}

/** Total size of a directory tree, for the build report. */
async function directoryKiB(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name)
    total += entry.isDirectory() ? (await directoryKiB(child)) * 1024 : (await stat(child)).size
  }
  return total / 1024
}

await copyPdfAssets()

console.log(`asktree-dsh built (externals: ${[...externalRequires].sort().join(', ')}):`)
for (const line of [
  await report(join(libDir, 'index.js')),
  await report(clientPath),
  `lib/pdfjs  ${(await directoryKiB(join(libDir, 'pdfjs'))).toFixed(1)} KiB (served by the host half)`,
]) console.log(`  ${line}`)