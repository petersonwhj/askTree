/**
 * PDF documents, from the v0.4.0 release notes: read a PDF in the app, page
 * through it, jump to a page, zoom, fit the width, and crop a region to ask
 * with the current page and its neighbours as context.
 *
 * The viewer fetches its worker, decoders, CMaps and fonts from `/pdfjs`, which
 * the host half serves; the harness static server plays that role here.
 */
import { expect, test, type Page } from '@playwright/test'
import { bootPanel, stubLlm } from './support'
import { fileURLToPath } from 'node:url'

const SAMPLE_PDF = fileURLToPath(new URL('./fixtures/sample.pdf', import.meta.url))

/** Open the two-page fixture PDF and wait until the viewer knows its length. */
async function openPdf(page: Page): Promise<void> {
  await page.locator('input[accept*=".pdf"]').first().setInputFiles(SAMPLE_PDF)
  await expect(page.locator('.pdf-pane canvas')).toBeVisible()
  await expect(page.locator('.pdf-page-total')).toHaveText('/ 2', { timeout: 30_000 })
}

test('a PDF opens, pages, and zooms', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openPdf(page)

  await expect(page.locator('.doc-kind').first()).toHaveText(/pdf/i)
  await expect(page.locator('.pdf-pane canvas')).toBeVisible()

  // Page through.
  await page.locator('.pdf-toolbar button', { hasText: '▶' }).click()
  await expect(page.locator('.pdf-page-input')).toHaveValue('2')
  await page.locator('.pdf-toolbar button', { hasText: '◀' }).click()
  await expect(page.locator('.pdf-page-input')).toHaveValue('1')

  // Jump to a page by number.
  await page.locator('.pdf-page-input').fill('2')
  await page.locator('.pdf-page-input').press('Enter')
  await expect(page.locator('.pdf-page-input')).toHaveValue('2')

  // Zoom in, zoom out, and fit the width.
  const zoom = page.locator('.pdf-zoom-label')
  const initial = await zoom.innerText()
  await page.locator('button[aria-label="Zoom in"]').click()
  await expect(zoom).not.toHaveText(initial)
  await page.locator('button[aria-label="Zoom out"]').click()
  await expect(zoom).toHaveText(initial)
  await page.locator('.pdf-fit').click()
  await expect(zoom).not.toHaveText('')
})

test('a region can be cropped and asked about with page context', async ({ page }) => {
  await bootPanel(page)
  const calls = await stubLlm(page, () => 'STUBANSWER the crop is text.')
  await openPdf(page)

  const canvas = page.locator('.pdf-pane canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 220, box.y + 140, { steps: 10 })
  await page.mouse.up()

  await page.locator('.pdf-crop-ask').click()
  await expect(page.locator('.context-capture')).toBeVisible()

  await page.locator('.asktree-dsh-scope textarea').first().fill('What does this region say?')
  await page.locator('.send-btn').click()
  await expect(page.locator('.markdown-pane').last()).toContainText('STUBANSWER', { timeout: 30_000 })
  await expect.poll(() => calls.length).toBe(1)

  // The crop plus the current page and its neighbours ride along as images.
  const body = JSON.stringify(calls[0].body)
  const imagePartCount = (calls[0].body.messages ?? [])
    .flatMap((message) => (Array.isArray(message.content) ? message.content : []))
    .filter((part) => (part as { type?: string }).type === 'image_url')
    .length
  expect(imagePartCount).toBe(3)
  expect(calls[0].prompt).toContain('Selected region')
  expect(calls[0].prompt).toContain('Page 1')
})

test('two crops of the same PDF page are siblings, not nested', async ({ page }) => {
  await bootPanel(page)
  const calls = await stubLlm(page, () => 'STUBANSWER.')
  await openPdf(page)

  /** Crop a band of the visible page and ask about it. */
  const askCrop = async (fromFraction: number, question: string): Promise<void> => {
    const box = (await page.locator('.pdf-pane canvas').boundingBox())!
    const top = box.y + box.height * fromFraction
    await page.mouse.move(box.x + 30, top)
    await page.mouse.down()
    await page.mouse.move(box.x + 200, top + box.height * 0.25, { steps: 10 })
    await page.mouse.up()
    await page.locator('.pdf-crop-ask').click()
    await expect(page.locator('.context-capture')).toBeVisible()
    await page.locator('.asktree-dsh-scope textarea').first().fill(question)
    await page.locator('.send-btn').click()
    await expect(page.locator('.markdown-pane').last()).toContainText('STUBANSWER', { timeout: 30_000 })
  }

  await askCrop(0.1, 'First question?')
  await askCrop(0.6, 'Second question?')

  await expect.poll(() => calls.length).toBe(2)
  // The second crop must hang off the document, beside the first answer.
  await expect(page.locator('.breadcrumb-bar')).toContainText('depth: 1')
  await expect(page.locator('.tree-node')).toHaveCount(2)
  // Both were image asks carrying the crop and its page context.
  for (const call of calls) expect(call.prompt).toContain('Selected region')
  expect(calls[1].prompt).toContain('Second question?')
  expect(calls[1].prompt).not.toContain('First question?')
})
