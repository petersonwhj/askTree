/**
 * Generate the long document the reading-position spec scrolls through.
 * Keeping it generated avoids committing a large fixture, and keeps the text
 * stable so the spec can rely on it.
 *
 * @module asktree-dsh/scripts/make-long-fixture
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const out = join(root, 'tests', 'e2e', 'fixtures')

const sections = []
sections.push('# A long article', '')
for (let index = 1; index <= 60; index += 1) {
  sections.push(`## Section ${index}`, '')
  sections.push(
    `Paragraph ${index} explains the idea in enough words that the pane has to scroll. `
    + `It mentions term-${index} and then restates it so the text wraps over several lines.`,
    '',
  )
  sections.push(
    `A second paragraph for section ${index} adds more prose, so the reading position has `
    + 'room to move and the restore has something measurable to land on.',
    '',
  )
}

await mkdir(out, { recursive: true })
await writeFile(join(out, 'long.md'), `${sections.join('\n')}\n`)
console.log(`wrote ${join(out, 'long.md')}`)