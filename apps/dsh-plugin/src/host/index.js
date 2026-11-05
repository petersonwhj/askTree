/**
 * AskTree for the DeepSeek Harness - host half.
 *
 * Two jobs:
 *
 * 1. Serve the pdf.js runtime assets under `/pdfjs`. The panel bundles the
 *    AskTree app verbatim, and `PdfPane` resolves its worker, WASM decoders,
 *    CMaps and standard fonts from `${import.meta.env.BASE_URL}pdfjs/`. The
 *    Harness serves only its own frontend, so without this route the viewer
 *    cannot start and every PDF fails to open.
 * 2. Optionally publish rebuilt browser bundles, so a rebuild reaches an open
 *    page without restarting the Harness.
 *
 * Phase B grows the model and storage seams here; the panel is still a
 * self-contained browser application with its own endpoint and IndexedDB.
 *
 * @module asktree-dsh
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Loader row id and plugin name. */
export const name = 'asktree-dsh'

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url))

/** The built browser bundle this package contributes. */
const CLIENT_BUNDLE = join(BUNDLE_DIR, 'client.js')

/** Static pdf.js runtime assets, copied here by scripts/build.mjs. */
const PDF_ASSET_DIR = join(BUNDLE_DIR, 'pdfjs')

/** Route prefix the panel resolves its pdf.js assets against. */
const PDF_ROUTE = '/pdfjs'

/** How often the optional dev watcher looks for a rebuilt bundle. */
const DEV_POLL_MS = 1500

/** How often route registration is retried while `webServer` is not up yet. */
const ROUTE_RETRY_MS = 500
const ROUTE_RETRY_LIMIT = 60

/** Content types the pdf.js assets use. */
const CONTENT_TYPES = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pfb': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
}

/**
 * Content type for one asset path.
 * @param file - absolute path of the asset.
 * @returns the response content type.
 */
function contentTypeOf(file) {
  const dot = file.lastIndexOf('.')
  return CONTENT_TYPES[file.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Serve one file from the pdf.js asset directory.
 *
 * These are pdf.js's own shipped files: static, public, and free of user data,
 * which is why this route carries no session check of its own. The requested
 * path is resolved and prefix-checked so it cannot escape the asset directory.
 * @param request - incoming HTTP request.
 * @param response - response owned by this handler.
 */
async function servePdfAsset(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405)
    response.end()
    return
  }

  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
  const relative = pathname.slice(PDF_ROUTE.length).replace(/^[/\\]+/, '')
  const file = resolve(PDF_ASSET_DIR, normalize(relative))
  if (file !== PDF_ASSET_DIR && !file.startsWith(PDF_ASSET_DIR + sep)) {
    response.writeHead(403)
    response.end()
    return
  }

  let info
  try {
    info = await stat(file)
  } catch {
    response.writeHead(404)
    response.end()
    return
  }
  if (!info.isFile()) {
    response.writeHead(404)
    response.end()
    return
  }

  response.writeHead(200, {
    'content-type': contentTypeOf(file),
    'content-length': String(info.size),
    'cache-control': 'public, max-age=3600',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).pipe(response)
}

/**
 * Register the `/pdfjs` route once the Web server service exists.
 *
 * The service is provided by a plugin that may activate after this one, so
 * registration is retried rather than declared as a hard injection: a headless
 * composition has no web server at all and must still load this plugin.
 * @param ctx - Cordis host context.
 */
function registerPdfAssets(ctx) {
  let attempts = 0
  const attempt = () => {
    const webServer = ctx.get?.('webServer')
    if (webServer === undefined) return false
    const dispose = webServer.register({ kind: 'prefix', path: PDF_ROUTE, handler: servePdfAsset })
    try {
      ctx.logger?.info?.('[asktree-dsh] serving pdf.js assets from %s', PDF_ASSET_DIR)
    } catch {
      // Logging is best-effort.
    }
    ctx.effect(() => () => dispose())
    return true
  }

  if (attempt()) return
  const timer = setInterval(() => {
    attempts += 1
    if (attempt() || attempts >= ROUTE_RETRY_LIMIT) clearInterval(timer)
  }, ROUTE_RETRY_MS)
  ctx.effect(() => () => clearInterval(timer))
}

/**
 * Mount the AskTree host half.
 * @param ctx - Cordis host context.
 * @param config - row config; `devWatch` opts into bundle rebuild publication.
 */
export function apply(ctx, config) {
  try {
    ctx.logger?.info?.('[asktree-dsh] host half loaded')
  } catch {
    // Logging is best-effort: never let it break activation.
  }

  if (existsSync(PDF_ASSET_DIR)) {
    registerPdfAssets(ctx)
  } else {
    try {
      ctx.logger?.warn?.('[asktree-dsh] pdf.js assets are missing; PDF viewing stays disabled')
    } catch {
      // Logging is best-effort.
    }
  }

  if (config?.devWatch !== true) return

  // Development convenience only. `clientModules.rebuilt()` is the single entry
  // point through which changed bundle bytes reach the browser entry graph, so
  // without it a rebuilt panel would need a full Harness restart.
  let lastMtime = 0
  const timer = setInterval(() => {
    const registry = ctx.get('clientModules')
    if (registry === undefined) return
    let mtime
    try {
      mtime = statSync(CLIENT_BUNDLE).mtimeMs
    } catch {
      return
    }
    if (mtime === lastMtime) return
    lastMtime = mtime
    try {
      registry.rebuilt(name)
      ctx.logger?.info?.('[asktree-dsh] published rebuilt client bundle')
    } catch (error) {
      ctx.logger?.warn?.('[asktree-dsh] rebuild publication failed: %s', String(error))
    }
  }, DEV_POLL_MS)

  ctx.effect(() => () => clearInterval(timer))
}