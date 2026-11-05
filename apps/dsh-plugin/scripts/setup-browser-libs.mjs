/**
 * Make Playwright's bundled Chromium runnable on a bare WSL image.
 *
 * `chrome-headless-shell` links `libasound.so.2`, which a slim Ubuntu install
 * does not ship, and installing it system-wide needs root. This fetches the
 * package as an ordinary user and extracts the shared object into
 * `.browser-libs/`, which `playwright.config.ts` then puts on the browser's
 * LD_LIBRARY_PATH. No sudo, nothing outside the package directory.
 *
 * @module asktree-dsh/scripts/setup-browser-libs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, '.browser-libs')
const libDir = join(outDir, 'root', 'usr', 'lib', 'x86_64-linux-gnu')
const library = join(libDir, 'libasound.so.2')

if (existsSync(library)) {
  console.log(`browser libraries already present: ${libDir}`)
  process.exit(0)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// The package was renamed for the 64-bit time_t transition; try both.
let fetched = false
for (const name of ['libasound2t64', 'libasound2']) {
  try {
    execFileSync('apt-get', ['download', name], { cwd: outDir, stdio: 'inherit' })
    fetched = true
    break
  } catch {
    // Try the next candidate name.
  }
}
if (!fetched) {
  throw new Error('could not download libasound with `apt-get download`; install it with your package manager instead')
}

for (const file of readdirSync(outDir).filter((name) => name.endsWith('.deb'))) {
  execFileSync('dpkg-deb', ['-x', join(outDir, file), join(outDir, 'root')], { stdio: 'inherit' })
}
if (!existsSync(library)) throw new Error('libasound.so.2 was not found in the extracted package')

console.log(`browser libraries ready: ${libDir}`)