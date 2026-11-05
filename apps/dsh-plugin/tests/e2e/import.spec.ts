/**
 * Non-Markdown material, from the v0.4.0 release notes: Word documents are
 * converted to Markdown on import, and an image can be attached in the ask bar
 * and sent to a vision-capable model.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, openDocument, stubLlm } from './support'
import { fileURLToPath } from 'node:url'

const SAMPLE_DOCX = fileURLToPath(new URL('./fixtures/sample.docx', import.meta.url))
const DOT_PNG = fileURLToPath(new URL('./fixtures/dot.png', import.meta.url))

test('a .docx document is converted to Markdown on import', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, SAMPLE_DOCX)

  await expect(page.locator('.doc-row')).toHaveCount(1)
  // The sidebar marks the document kind, and the pane shows converted content.
  await expect(page.locator('.doc-kind').first()).toHaveText(/docx/i)
  const pane = page.locator('.markdown-pane').first()
  await expect(pane).toBeVisible()
  expect((await pane.innerText()).trim().length).toBeGreaterThan(0)
  await expect(page.locator('.error-banner')).toHaveCount(0)
})

test('an attached image is sent to the model with the question', async ({ page }) => {
  await bootPanel(page)
  const calls = await stubLlm(page, () => 'STUBANSWER it is a single pixel.')
  await openDocument(page)

  await page.locator('.asktree-dsh-scope input[accept="image/*"]').setInputFiles(DOT_PNG)
  await expect(page.locator('.ask-images .ask-image img')).toHaveCount(1)

  await page.locator('.asktree-dsh-scope textarea').first().fill('What is in this image?')
  await page.locator('.send-btn').click()
  await expect(page.locator('.markdown-pane').last()).toContainText('STUBANSWER', { timeout: 20_000 })
  await expect.poll(() => calls.length).toBe(1)

  // The vision payload must ride along as an inline data URL.
  const body = JSON.stringify(calls[0].body)
  expect(body).toContain('image_url')
  expect(body).toContain('data:image/png;base64,')
  expect(calls[0].prompt).toContain('What is in this image?')
})

test('an attached image can be removed again', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page)

  await page.locator('.asktree-dsh-scope input[accept="image/*"]').setInputFiles(DOT_PNG)
  await expect(page.locator('.ask-image')).toHaveCount(1)
  await page.locator('.ask-image button[aria-label="Remove image"]').click()
  await expect(page.locator('.ask-image')).toHaveCount(0)
})