/**
 * Suggested questions, from the v0.1.0 release notes: "click the lightbulb for
 * three questions about the current passage; refresh for a new batch", plus the
 * "?" prompt inspector.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, dragSelect, openDocument, stubLlm } from './support'

const THREE = 'STUBQ What is carbon fixation?\nSTUBQ Why does RuBisCO matter?\nSTUBQ How is ATP consumed?'

test('the lightbulb offers three questions that can be asked directly', async ({ page }) => {
  await bootPanel(page)
  const calls = await stubLlm(page, (call) => call.isSuggest ? THREE : 'STUBANSWER fixed by RuBisCO.')
  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.assist-btn').click()

  const panel = page.locator('.suggest-panel')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(panel.locator('.suggest-title')).toContainText('Suggested questions')
  const items = panel.locator('.suggest-item')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('What is carbon fixation?')

  await expect.poll(() => calls.length).toBe(1)
  expect(calls[0].prompt).toContain('propose exactly 3 short')

  // Clicking a suggestion asks it straight away.
  await items.nth(1).click()
  await expect(page.locator('.asktree-dsh-scope')).toContainText('STUBANSWER', { timeout: 20_000 })
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1].prompt).toContain('Why does RuBisCO matter?')
})

test('suggestions can be refreshed and dismissed', async ({ page }) => {
  await bootPanel(page)
  let batch = 0
  await stubLlm(page, (call) => {
    if (!call.isSuggest) return 'STUBANSWER.'
    batch += 1
    return `STUBQ batch ${batch} one?\nSTUBQ batch ${batch} two?\nSTUBQ batch ${batch} three?`
  })
  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.assist-btn').click()
  await expect(page.locator('.suggest-item').first()).toContainText('batch 1', { timeout: 20_000 })

  await page.locator('.suggest-action[aria-label="Refresh suggestions"]').click()
  await expect(page.locator('.suggest-item').first()).toContainText('batch 2', { timeout: 20_000 })

  await page.locator('.suggest-action[aria-label="Close suggestions"]').click()
  await expect(page.locator('.suggest-panel')).toHaveCount(0)
})

test('the suggested-questions prompt can be inspected', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? THREE : 'STUBANSWER.')
  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.assist-btn').click()
  await expect(page.locator('.suggest-item').first()).toBeVisible({ timeout: 20_000 })

  await page.locator('.suggest-action[aria-label="Debug suggested questions"]').click()
  await expect(page.locator('h2', { hasText: 'Prompt Debug' })).toBeVisible()
  await expect(page.locator('.prompt-debug-system, .prompt-debug-user').first()).toBeVisible()
  await expect(page.locator('.prompt-debug-modal')).toContainText('propose exactly 3 short')
})