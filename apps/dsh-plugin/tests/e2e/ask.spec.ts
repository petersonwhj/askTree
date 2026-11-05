/**
 * The product's core loop, from the v0.1.0 release notes: "Select-to-ask -
 * highlight any passage, click the floating button, and get a full Markdown
 * answer as a new child page. Drill into answers recursively."
 *
 * Answers are asserted by a stub marker that appears nowhere in the source
 * document, so `toContainText` cannot pass on text that was already on screen.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, dragSelect, openDocument, stubLlm } from './support'

const ANSWER_ONE = 'STUBANSWER RuBisCO catalyses the first committed step.'
const ANSWER_TWO = 'STUBANSWER2 A thylakoid is a membrane sac.'

test('selecting a passage and asking creates an answer page', async ({ page }) => {
  const problems = await bootPanel(page)
  const calls = await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : ANSWER_ONE)

  await openDocument(page)

  // 1. Selecting offers the floating button, quoting what was selected.
  await dragSelect(page, '.markdown-pane p >> nth=1')
  const floating = page.locator('.floating-ask')
  await expect(floating).toBeVisible()
  await expect(floating).toContainText('Ask about')
  await expect(floating).toContainText('ATP and NADPH')

  // 2. Clicking it anchors the ask bar to that passage.
  await floating.click()
  const askBar = page.locator('.asktree-dsh-scope textarea').first()
  await expect(askBar).toHaveAttribute('placeholder', /^About:/)

  // 3. Sending asks the model, with the passage and the trail in the prompt.
  await askBar.fill('What does RuBisCO actually do?')
  await page.locator('.send-btn').click()

  // 4. The answer becomes a page in the right-hand pane.
  await expect(page.locator('.asktree-dsh-scope')).toContainText('STUBANSWER', { timeout: 20_000 })
  await expect.poll(() => calls.length).toBe(1)

  expect(calls[0].prompt).toContain('What does RuBisCO actually do?')
  expect(calls[0].prompt).toContain('RuBisCO is the enzyme')
  expect(calls[0].prompt).toContain('study assistant')

  if (problems.length > 0) console.log('page problems:', problems.join(' | '))
})

test('an answer page can be drilled into recursively', async ({ page }) => {
  await bootPanel(page)
  const calls = await stubLlm(page, (call) => {
    if (call.isSuggest) return 'a?\nb?\nc?'
    return call.prompt.includes('What is a thylakoid') ? ANSWER_TWO : ANSWER_ONE
  })

  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill('What does RuBisCO do?')
  await page.locator('.send-btn').click()
  await expect(page.locator('.asktree-dsh-scope')).toContainText('STUBANSWER ', { timeout: 20_000 })

  // The answer is itself a Markdown page: select inside it and drill deeper.
  const answerParagraph = page.locator('.markdown-pane p', { hasText: 'STUBANSWER ' }).first()
  await expect(answerParagraph).toBeVisible()
  await dragSelect(page, '.markdown-pane p:has-text("STUBANSWER ")')
  await expect(page.locator('.floating-ask')).toBeVisible()
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill('What is a thylakoid?')
  await page.locator('.send-btn').click()

  await expect(page.locator('.asktree-dsh-scope')).toContainText('STUBANSWER2', { timeout: 20_000 })
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1].prompt).toContain('What is a thylakoid?')
})

test('the breadcrumb grows with the drill-down trail', async ({ page }) => {
  await bootPanel(page)
  await stubLlm(page, (call) => call.isSuggest ? 'a?\nb?\nc?' : 'STUBANSWER explains the term.')
  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill('What is a thylakoid?')
  await page.locator('.send-btn').click()
  await expect(page.locator('.asktree-dsh-scope')).toContainText('STUBANSWER', { timeout: 20_000 })

  const bar = page.locator('.breadcrumb-bar')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('notes')
  await expect(bar).toContainText('depth: 1')
})