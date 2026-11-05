/**
 * Copy the built plugin into a directory the Windows-side Harness can install.
 *
 * The source of truth stays in the WSL checkout; the Harness profile runs on
 * Windows and pnpm installs a local directory by linking it, so the built files
 * must exist on a path the Harness process can read. The destination is
 * deployment-specific, so it is required rather than defaulted.
 *
 * @module asktree-dsh/scripts/sync-windows
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dest = process.env.ASKTREE_DSH_DEST?.trim()
if (dest === undefined || dest === '') {
  throw new Error(
    'set ASKTREE_DSH_DEST to the absolute path the Harness side can read, for example:\n'
    + '  ASKTREE_DSH_DEST=/mnt/d/asktree-dsh-plugin pnpm --filter asktree-dsh sync:win',
  )
}

if (!existsSync(join(root, 'lib', 'client.js'))) {
  throw new Error('lib/client.js is missing - run `pnpm build` first')
}

await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
for (const entry of ['lib', 'cordis.patch.yml', 'package.json', 'README.md']) {
  const from = join(root, entry)
  if (!existsSync(from)) continue
  await cp(from, join(dest, entry), { recursive: true })
}

const { size } = await stat(join(dest, 'lib', 'client.js'))
console.log(`synced ${dest} (client.js ${(size / 1024).toFixed(1)} KiB)`)