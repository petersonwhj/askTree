/**
 * Build the Playwright harness directory.
 *
 * Emits `tests/e2e/dist/` containing exactly what the harness page needs:
 * a bundled `harness.js` (React + the loader shim + the mount), a verbatim copy
 * of the built `lib/client.js`, the pdf.js runtime assets the viewer fetches
 * from `/pdfjs`, the page itself, and the fixtures.
 *
 * @module asktree-dsh/scripts/build-harness
 */
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const repo = resolve(root, '..', '..')
const e2e = join(root, 'tests', 'e2e')
const dist = join(e2e, 'dist')

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

await build({
  configFile: false,
  root,
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    sourcemap: false,
    lib: {
      entry: join(e2e, 'harness.ts'),
      formats: ['iife'],
      name: 'AskTreeHarness',
      fileName: () => 'harness.js',
    },
  },
})

await cp(join(e2e, 'index.html'), join(dist, 'index.html'))
await cp(join(root, 'lib', 'client.js'), join(dist, 'client.js'))
await cp(join(e2e, 'fixtures'), join(dist, 'fixtures'), { recursive: true })

// The harness static server plays the host half's role for /pdfjs.
const pdfSource = join(root, 'lib', 'pdfjs')
if (existsSync(pdfSource)) {
  await cp(pdfSource, join(dist, 'pdfjs'), { recursive: true })
} else {
  console.warn('lib/pdfjs is missing; PDF specs will fail. Run `pnpm build` first.')
}

console.log(`harness built -> ${dist}`)