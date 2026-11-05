/**
 * The forest, from the v0.3.0 release notes: "one AskTree instance now holds
 * many independent documents", with per-document rename / export / delete,
 * a "New" action, and Import Tree appending rather than replacing.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, NOTES, openDocument, stubLlm } from './support'
import { fileURLToPath } from 'node:url'

const NOTES2 = fileURLToPath(new URL('./fixtures/notes2.md', import.meta.url))

test('two documents are listed independently and can be switched', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await stubLlm(page, () => 'unused')

  await openDocument(page, NOTES)
  await expect(page.locator('.doc-row')).toHaveCount(1)

  await openDocument(page, NOTES2)
  await expect(page.locator('.doc-row')).toHaveCount(2)

  const rows = page.locator('.doc-row')
  await expect(rows.nth(0)).toContainText('notes')
  await expect(rows.nth(1)).toContainText('notes2')

  // Switching back shows the first document's prose, not the second's.
  await rows.nth(0).click()
  await expect(page.locator('.markdown-pane').first()).toContainText('Photosynthesis')
  await expect(page.locator('.markdown-pane').first()).not.toContainText('Entropy measures')

  await rows.nth(1).click()
  await expect(page.locator('.markdown-pane').first()).toContainText('Entropy measures')
})

test('New deselects without destroying the forest', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, NOTES)

  await page.locator('button[aria-label="New document"]').click()
  await expect(page.locator('.empty-state')).toBeVisible()
  await expect(page.locator('h2', { hasText: 'Welcome to AskTree' })).toBeVisible()
  // The document is still listed.
  await expect(page.locator('.doc-row')).toHaveCount(1)

  // And the empty state can create a fresh document from pasted text.
  await page.locator('.empty-state-input').fill('Pasted article')
  await page.locator('.empty-state-textarea').fill('# Pasted\n\nSome body text.')
  await page.locator('button', { hasText: 'Start Learning' }).click()
  await expect(page.locator('.doc-row')).toHaveCount(2)
  await expect(page.locator('.doc-row').nth(1)).toContainText('Pasted article')
})

test('a document can be renamed inline', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, NOTES)

  const row = page.locator('.doc-row').first()
  await row.hover()
  await row.locator('button[aria-label="Rename notes"]').click()

  const input = page.locator('.doc-rename-input')
  await expect(input).toBeVisible()
  await input.fill('Photosynthesis notes')
  await input.press('Enter')

  await expect(page.locator('.doc-row').first()).toContainText('Photosynthesis notes')
})

test('deleting a document asks for confirmation first', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, NOTES)

  const row = page.locator('.doc-row').first()
  await row.hover()
  await row.locator('button[aria-label="Delete notes"]').click()

  const modal = page.locator('.settings-modal')
  await expect(modal).toContainText('Delete this document?')
  await modal.locator('button', { hasText: 'Cancel' }).click()
  await expect(page.locator('.doc-row')).toHaveCount(1)

  await row.hover()
  await row.locator('button[aria-label="Delete notes"]').click()
  await page.locator('.settings-modal button', { hasText: 'Delete' }).click()
  await expect(page.locator('.doc-row')).toHaveCount(0)
  await expect(page.locator('.empty-state')).toBeVisible()
})

test('Export Tree writes a bundle that Import Tree appends back', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, NOTES)

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[title="Export the active document as JSON"]').click(),
  ]).then(([event]) => event)

  expect(download.suggestedFilename()).toBe('notes.json')
  const exported = await download.path()
  expect(exported).not.toBeNull()

  await page.locator('input[accept=".json,.zip"]').setInputFiles(exported!)
  await expect(page.locator('.doc-row')).toHaveCount(2)
})

test('answers stay with their own document', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER for the first document.')

  await openDocument(page, NOTES)
  const pane = page.locator('.markdown-pane p').nth(1)
  const box = (await pane.boundingBox())!
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill('What is RuBisCO?')
  await page.locator('.send-btn').click()
  await expect(page.locator('.markdown-pane').nth(1)).toContainText('STUBANSWER', { timeout: 20_000 })

  // A second document starts with an untouched tree.
  await openDocument(page, NOTES2)
  await expect(page.locator('.tree-node')).toHaveCount(0)

  // Returning to the first document brings its answer back.
  await page.locator('.doc-row').first().click()
  await expect(page.locator('.tree-node')).toHaveCount(1)
})