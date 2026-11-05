/**
 * Static server for the Playwright harness. Serves the built harness directory
 * with no transform pipeline, so the spec exercises exactly the bytes the
 * Harness would fetch.
 *
 * @module asktree-dsh/tests/e2e/serve
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./dist/', import.meta.url))
const port = Number(process.env.HARNESS_PORT ?? 5199)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
    const target = relative === '/' || relative === sep ? 'index.html' : relative.replace(/^[/\\]/, '')
    const file = join(root, target)
    const info = await stat(file).catch(() => null)
    if (info === null || info.isDirectory()) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(await readFile(file))
  } catch (error) {
    response.writeHead(500)
    response.end(String(error))
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`asktree-dsh harness on http://127.0.0.1:${port}/`)
})