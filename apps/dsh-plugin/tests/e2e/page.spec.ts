/**
 * Per-page actions and reading aids, from the v0.1.0 release notes:
 * mark a page resolved, copy/download a page as Markdown, Prompt Debug,
 * free ask with Left/Right, and the "already asked" underline.
 */
import { expect, test } from '@playwright/test'
import { askAbout, bootPanel, dragSelect, openDocument, stubLlm } from './support'

/** Ask one question about the second paragraph of the loaded document. */
async function askOnce(page: import('@playwright/test').Page, question = 'What is RuBisCO?'): Promise<void> {
  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill(question)
  await page.locator('.send-btn').click()
  await expect(page.locator('.markdown-pane').nth(1)).toContainText('STUBANSWER', { timeout: 20_000 })
}

test('a page can be marked resolved and the sidebar dot follows', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER.')
  await openDocument(page)
  await askOnce(page)

  const dot = page.locator('.tree-node .status-dot').first()
  await expect(dot).toHaveAttribute('style', /rgb\(226, 183, 20\)|#e2b714/)

  await page.locator('.panel').nth(1).locator('.status-select').selectOption('resolved')
  await expect(dot).toHaveAttribute('style', /rgb\(63, 185, 80\)|#3fb950/)
})

test('a previously asked passage is underlined, the active one is highlighted', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER.')
  await openDocument(page)

  // The active quote is a highlight; other asked passages get the underline, so
  // the parent pane only shows an explored mark once it has two asked children.
  const pane = page.locator('.markdown-pane').first()
  await askAbout(page, pane.locator('p').nth(1), 'First question?')
  await askAbout(page, pane.locator('p').nth(0), 'Second question?')

  await expect(pane.locator('mark.asktree-highlight')).toHaveCount(1)
  await expect(pane.locator('mark.asktree-explored')).toHaveCount(1)
})

test('a page can be copied and downloaded as Markdown', async ({ page, context }) => {
  await bootPanel(page, { llm: false })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDocument(page)

  const pane = page.locator('.panel').first()
  await pane.locator('button[aria-label="Copy markdown"]').click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('Photosynthesis')

  const download = await Promise.all([
    page.waitForEvent('download'),
    pane.locator('button[aria-label="Download markdown"]').click(),
  ]).then(([event]) => event)
  expect(download.suggestedFilename()).toBe('notes.md')
})

test('Prompt Debug shows the assembled SYSTEM and USER prompt', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER.')
  await openDocument(page)
  await askOnce(page, 'What does RuBisCO do?')

  await page.locator('.panel').nth(1).locator('.prompt-debug-btn').click()
  const modal = page.locator('.prompt-debug-modal')
  await expect(modal).toBeVisible()
  await expect(modal.locator('h2')).toHaveText('Prompt Debug')
  await expect(modal.locator('.prompt-debug-question')).toContainText('What does RuBisCO do?')
  await expect(modal.locator('.prompt-debug-system')).toContainText('study assistant')
  await expect(modal.locator('.prompt-debug-user')).toContainText('What does RuBisCO do?')
})

test('free ask offers Left / Right once the tree is deeper than the root', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER.')
  await openDocument(page)
  await askOnce(page)

  await page.locator('button[aria-label="Clear context"]').click()

  const toggle = page.locator('.free-ask-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle.locator('.free-ask-option').first()).toHaveText(/◀\s*Left/)
  await expect(toggle.locator('.free-ask-option').last()).toHaveText(/Right\s*▶/)

  await toggle.locator('.free-ask-option').first().click()
  await expect(toggle.locator('.free-ask-option').first()).toHaveAttribute('aria-pressed', 'true')
})