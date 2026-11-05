/**
 * Verify the built host half without the Harness.
 *
 * The host half serves the pdf.js runtime assets the bundled viewer fetches
 * from `/pdfjs`. That route is easy to get subtly wrong - wrong prefix, wrong
 * content type, an escape past the asset directory - and a mistake only shows
 * up as a PDF that will not open. This loads the real `lib/index.js`, mounts it
 * against a recording Web-server service, and drives the handler with mock
 * requests.
 *
 * @module asktree-dsh/scripts/verify-host
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
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

// --- mount the real built host half against a recording service ------------
const routes = []
const effects = []
const logs = []
const ctx = {
  logger: {
    info: (...args) => logs.push(['info', args]),
    warn: (...args) => logs.push(['warn', args]),
  },
  get(name) {
    if (name !== 'webServer') return undefined
    return {
      register(route) {
        routes.push(route)
        return () => {}
      },
    }
  },
  effect(callback) {
    effects.push(callback)
  },
}

const host = await import(join(root, 'lib', 'index.js'))
if (host.name !== pkg.name) fail(`host plugin name is ${String(host.name)}`)
pass(`host plugin exports name=${host.name}`)
if (typeof host.apply !== 'function') fail('host half does not export apply')
host.apply(ctx, {})
pass('apply() ran without throwing')

if (routes.length !== 1) fail(`expected one registered route, saw ${routes.length}`)
const route = routes[0]
if (route.kind !== 'prefix') fail(`route kind is ${String(route.kind)}`)
if (route.path !== '/pdfjs') fail(`route path is ${String(route.path)}`)
pass('registered a "prefix" route at /pdfjs')
if (effects.length === 0) fail('the route disposer was not handed to ctx.effect')
pass('the route disposer is an effect, so it unloads with the plugin')

// --- drive the handler ------------------------------------------------------
/**
 * Call the route handler with a mock request and collect the response.
 * @param url - request URL.
 * @param method - HTTP method.
 * @returns status, headers, and the written byte count.
 */
function invoke(url, method = 'GET') {
  return new Promise((done, reject) => {
    let status = 0
    let headers = {}
    let bytes = 0
    // A real ServerResponse is a Writable, and the handler pipes into it.
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        bytes += chunk.length
        callback()
      },
    })
    sink.writeHead = (code, extra) => {
      status = code
      headers = extra ?? {}
    }
    sink.on('finish', () => done({ status, headers, bytes }))
    Promise.resolve(route.handler({ method, url }, sink)).catch(reject)
  })
}

const worker = await invoke('/pdfjs/pdf.worker.min.mjs')
if (worker.status !== 200) fail(`the worker answered ${worker.status}`)
if (!String(worker.headers['content-type']).startsWith('text/javascript')) {
  fail(`the worker content type is ${String(worker.headers['content-type'])}`)
}
if (worker.bytes < 500_000) fail(`the worker body is only ${worker.bytes} bytes`)
pass(`serves the pdf.js worker (${(worker.bytes / 1024).toFixed(0)} KiB, ${worker.headers['content-type']})`)

const cMap = await invoke('/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap')
if (cMap.status !== 200) fail(`a CMaps asset answered ${cMap.status}`)
pass('serves CMaps assets')

const wasm = await invoke('/pdfjs/wasm/')
if (wasm.status === 200) fail('a directory must not be served as a file')
pass('refuses to serve a directory')

const head = await invoke('/pdfjs/pdf.worker.min.mjs', 'HEAD')
if (head.status !== 200 || head.bytes !== 0) fail(`HEAD answered ${head.status} with ${head.bytes} bytes`)
pass('answers HEAD with headers and no body')

const missing = await invoke('/pdfjs/nope.bcmap')
if (missing.status !== 404) fail(`a missing asset answered ${missing.status}`)
pass('answers 404 for an unknown asset')

const post = await invoke('/pdfjs/pdf.worker.min.mjs', 'POST')
if (post.status !== 405) fail(`POST answered ${post.status}`)
pass('answers 405 for an unsupported method')

// The URL parser already collapses a plain `..` segment, so that form lands
// harmlessly on a missing file...
const collapsed = await invoke('/pdfjs/%2e%2e/package.json')
if (collapsed.status !== 404) fail(`a collapsed dot segment answered ${collapsed.status}`)
// ...but an encoded slash survives parsing and reaches the handler as a real
// traversal, which the resolved-and-prefix-checked path must refuse.
const escape = await invoke('/pdfjs/..%2f..%2fpackage.json')
if (escape.status !== 403) fail(`a traversal attempt answered ${escape.status}`)
pass('refuses a traversal attempt with 403, and collapses a plain dot segment')

console.log('\nhost half verified')