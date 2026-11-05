/**
 * Reading continuity, from the v0.1.0 release notes: "reading position is
 * restored per page". The position is stored per node and persists in the
 * document's own tree record, so it must survive a reload.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, openDocument } from './support'
import { fileURLToPath } from 'node:url'

const LONG_MD = fileURLToPath(new URL('./fixtures/long.md', import.meta.url))

test('the reading position survives a reload', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page, LONG_MD)

  const pane = page.locator('.markdown-pane').first()
  const scrollable = await pane.evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(scrollable, 'the fixture must overflow so it can scroll').toBeGreaterThan(200)

  await pane.evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5
    el.dispatchEvent(new Event('scroll'))
  })
  // The pane debounces the save by 250 ms before persisting.
  await page.waitForTimeout(700)
  const before = await pane.evaluate((el) => el.scrollTop)
  expect(before).toBeGreaterThan(0)

  await page.reload()
  await page.waitForFunction(() => (window as unknown as { __ASK_READY__?: boolean }).__ASK_READY__ === true)
  const restoredPane = page.locator('.markdown-pane').first()
  await expect(restoredPane).toBeVisible()

  // The restore runs inside a requestAnimationFrame; give it a frame to settle.
  await page.waitForTimeout(300)
  const after = await restoredPane.evaluate((el) => el.scrollTop)
  expect(Math.abs(after - before)).toBeLessThan(40)
})