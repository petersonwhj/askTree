/**
 * Verify the built browser half without a browser.
 *
 * The Harness loader contract has parts a build can get wrong silently: the
 * bundle must register itself under the package name, its factory must return a
 * Cordis plugin whose `apply` populates the expected slots, the stylesheet it
 * installs must stay scoped to the panel, and the panel component must actually
 * mount the AskTree application. This script exercises all of them against the
 * real `lib/client.js`:
 *
 *   1. evaluate the bundle in a jsdom realm behind a stubbed
 *      `window.__ModuleLoader__`, capturing the loader row;
 *   2. hand the factory the same require shim the shell's module table would
 *      answer, and call the plugin's `apply` with a recording slot registry;
 *   3. render the recorded `main` panel and assert the AskTree UI painted.
 *
 * @module asktree-dsh/scripts/verify-client
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import 'fake-indexeddb/auto'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const clientPath = join(root, 'lib', 'client.js')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

/** Fail the run with a clear message. */
function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

/** Report one satisfied assertion. */
function pass(message) {
  console.log(`  ok  ${message}`)
}

// --- 1. a browser realm ----------------------------------------------------
const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="panel-host"></div><div id="icon-host"></div></body></html>',
  { url: 'http://127.0.0.1:19387/', pretendToBeVisual: true },
)
const { window } = dom
window.process = process
window.global = window
if (window.crypto === undefined) window.crypto = globalThis.crypto

/** Minimal Storage stand-in: jsdom does not always expose localStorage. */
function memoryStorage() {
  const map = new Map()
  return {
    get length() { return map.size },
    clear: () => { map.clear() },
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(String(key)) },
    setItem: (key, value) => { map.set(String(key), String(value)) },
  }
}
for (const name of ['localStorage', 'sessionStorage']) {
  let present = false
  try { present = window[name] != null } catch { present = false }
  if (!present) Object.defineProperty(window, name, { value: memoryStorage(), configurable: true })
}

for (const key of [
  'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
  'DocumentFragment', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'MutationObserver', 'Blob', 'File', 'FileReader', 'Image',
  'localStorage', 'sessionStorage', 'location', 'history',
]) {
  const value = window[key]
  if (value === undefined) continue
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
}
Object.defineProperty(globalThis, 'URL', { value: window.URL, configurable: true, writable: true })
Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })
Object.defineProperty(globalThis, 'self', { value: window, configurable: true, writable: true })

const React = (await import('react')).default
const jsxRuntime = await import('react/jsx-runtime')
const reactDom = (await import('react-dom')).default
const reactDomClient = await import('react-dom/client')

// --- 2. evaluate the bundle behind a stubbed loader ------------------------
let row
window.__ModuleLoader__ = { load: (loaded) => { row = loaded } }
window.eval(await readFile(clientPath, 'utf8'))

if (row === undefined) fail('the bundle never called window.__ModuleLoader__.load')
pass('bundle registered through window.__ModuleLoader__.load')
if (row.id !== pkg.name) fail(`bundle id is ${JSON.stringify(row.id)}, expected ${JSON.stringify(pkg.name)}`)
pass(`bundle id equals the package name (${row.id})`)

const shared = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': reactDom,
  'react-dom/client': reactDomClient,
}
const requested = []
const plugin = row.factory((specifier) => {
  requested.push(specifier)
  const module = shared[specifier]
  if (module === undefined) throw new Error(`the shell module table cannot answer require(${JSON.stringify(specifier)})`)
  return module
})
pass(`factory requested only shared modules: ${requested.sort().join(', ')}`)

// --- 3. apply against a recording slot registry ----------------------------
const registered = []
const ctx = {
  slots: {
    register(options, component) {
      registered.push({ options, component })
      return () => {}
    },
    inject(_name, callback) {
      callback()
    },
  },
}
if (typeof plugin?.apply !== 'function') fail('the factory did not return a plugin with an apply function')
plugin.apply(ctx)
pass('apply() ran without throwing')

const panel = registered.find((entry) => entry.options?.name === 'main')
const icon = registered.find((entry) => entry.options?.name === 'sidebar.panellist')
if (panel === undefined) fail('no registration into the "main" slot')
if (panel.options.key !== 'asktree') fail(`main slot key is ${String(panel.options.key)}`)
pass('registered the "asktree" key into the keyed "main" slot')
if (icon === undefined) fail('no registration into the "sidebar.panellist" slot')
if (icon.options.id !== 'asktree') fail(`sidebar panel id is ${String(icon.options.id)}`)
if (typeof icon.options.label !== 'function' || icon.options.label() !== 'AskTree') {
  fail('the sidebar entry does not project the "AskTree" label')
}
pass(`registered the sidebar entry (id=asktree, order=${String(icon.options.order)}, label=AskTree)`)

// --- 4. the stylesheet must be installed and scoped -------------------------
const sheet = window.document.head.querySelector('style[data-asktree="styles"]')
if (sheet === null) fail('apply() did not install the panel stylesheet')
pass('apply() installed the panel stylesheet in the document head')

const css = sheet.textContent
for (const needle of ['.asktree-dsh-scope .app-header', '.asktree-dsh-scope .markdown-pane', '@font-face']) {
  if (!css.includes(needle)) fail(`the stylesheet is missing ${needle}`)
}
pass('the stylesheet carries the scoped AskTree rules and KaTeX')

for (const [pattern, label] of [
  [/(?:^|[{};])\s*body\s*\{/, 'body rule'],
  [/(?:^|[{};])\s*#root\s*\{/, '#root rule'],
  [/(?:^|[{};])\s*\*\s*(?:,[^{}]*)?\{/, 'universal rule'],
]) {
  if (pattern.test(css)) fail(`the stylesheet leaks an unscoped ${label} into the Harness document`)
}
pass('no whole-document rule leaked out of the panel scope')

// --- 5. render the panel ---------------------------------------------------
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = predicate()
    if (value) return value
    await new Promise((done) => setTimeout(done, 25))
  }
  const rendered = window.document.getElementById('panel-host')?.innerHTML ?? ''
  fail(`timed out waiting for ${label}${rendered === '' ? '' : `\n--- panel html ---\n${rendered.slice(0, 1500)}`}`)
}

const panelRoot = reactDomClient.createRoot(window.document.getElementById('panel-host'))
panelRoot.render(React.createElement(panel.component))

const scope = await waitFor(
  () => window.document.querySelector('.asktree-dsh-scope'),
  'the panel scope root',
)
if (scope.shadowRoot !== null) fail('the panel attached a shadow root; the selection API retargets inside one')
pass('the panel mounted in the light DOM (no shadow root)')

const app = await waitFor(() => scope.querySelector('.app'), 'the mounted AskTree shell')
const text = app.textContent ?? ''
if (!text.includes('AskTree')) fail(`the mounted app does not show the AskTree brand; saw ${JSON.stringify(text.slice(0, 120))}`)
pass('the AskTree application mounted and painted inside the panel')

const iconRoot = reactDomClient.createRoot(window.document.getElementById('icon-host'))
iconRoot.render(React.createElement(icon.component, { size: 18, active: true }))
const iconHtml = await waitFor(() => {
  const html = window.document.getElementById('icon-host').innerHTML
  return html.includes('<svg') ? html : null
}, 'the sidebar icon svg')
if (!iconHtml.includes('width="18"')) fail('the sidebar icon ignored the owner size prop')
pass('the sidebar icon rendered at the size the sidebar requested')

console.log('\nclient bundle verified')