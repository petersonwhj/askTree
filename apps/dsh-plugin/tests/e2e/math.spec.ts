/**
 * Math rendering, from the v0.2.0 release notes: markdown-it-texmath understands
 * both delimiter styles, and lone dollar amounts or code stay untouched.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, MATH, openDocument } from './support'

test('both LaTeX delimiter styles render, and lone dollars do not', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, MATH)

  const pane = page.locator('.markdown-pane').first()
  await expect(pane).toBeVisible()
  await expect(pane.locator('.katex').first()).toBeVisible()

  // `$$...$$` and `\[...\]` both produce display math.
  expect(await pane.locator('.katex-display').count()).toBeGreaterThanOrEqual(2)
  // `$...$`, `$$...$$`, `\[...\]` and `\(...\)` = four formulas.
  expect(await pane.locator('.katex').count()).toBeGreaterThanOrEqual(4)

  const text = await pane.innerText()
  // A lone price and a lone shell variable keep their literal dollars.
  expect(text).toContain('$5')
  expect(text).toContain('$HOME')
  // The standard delimiters must not survive as literal brackets.
  expect(text).not.toContain('\\[')
  expect(text).not.toContain('\\(')
})