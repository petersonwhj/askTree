/**
 * Panel integration: what the Harness actually loads.
 *
 * The plugin renders in the LIGHT DOM on purpose. An earlier version used a
 * shadow root for CSS containment, and Chromium retargets `window.getSelection()`
 * nodes to the shadow host - which silently killed the floating Ask button, the
 * product's core interaction. These specs pin both halves of that decision: no
 * shadow root, and a stylesheet that stays scoped to the panel instead.
 */
import { expect, test } from '@playwright/test'
import { bootPanel, dragSelect, openDocument } from './support'

test('the panel mounts in the light DOM with a scoped stylesheet', async ({ page }) => {
  const problems = await bootPanel(page, { llm: false })

  const probe = await page.evaluate(() => {
    const scope = document.querySelector('.asktree-dsh-scope')
    const sheet = document.querySelector('style[data-asktree="styles"]')
    return {
      hasScope: scope !== null,
      hasShadowRoot: scope !== null && scope.shadowRoot !== null,
      sheetInHead: sheet !== null && sheet.parentElement?.tagName === 'HEAD',
      sheetLength: sheet?.textContent?.length ?? 0,
      scopedRules: (sheet?.textContent ?? '').includes('.asktree-dsh-scope .app-header'),
      unscopedBodyRule: /(?:^|[{};])\s*body\s*\{/.test(sheet?.textContent ?? ''),
      kneadedFonts: (sheet?.textContent ?? '').includes('data:font/woff2;base64,'),
    }
  })

  expect(probe.hasScope).toBe(true)
  expect(probe.hasShadowRoot).toBe(false)
  expect(probe.sheetInHead).toBe(true)
  expect(probe.scopedRules).toBe(true)
  expect(probe.unscopedBodyRule).toBe(false)
  expect(probe.kneadedFonts).toBe(true)
  expect(problems).toEqual([])
})

test('selecting text in the markdown pane offers the floating Ask button', async ({ page }) => {
  await bootPanel(page, { llm: false })
  await openDocument(page)

  await dragSelect(page, '.markdown-pane p >> nth=1')

  // The selection must be a real in-document selection: an Element anchor or a
  // retargeted shadow node is exactly the failure this test exists to catch.
  const probe = await page.evaluate(() => {
    const selection = window.getSelection()
    const scope = document.querySelector('.asktree-dsh-scope')
    return {
      collapsed: selection?.isCollapsed ?? null,
      anchorNodeType: selection?.anchorNode?.nodeType ?? null,
      anchorInsidePanel: selection?.anchorNode != null && scope?.contains(selection.anchorNode) === true,
    }
  })
  expect(probe.collapsed).toBe(false)
  expect(probe.anchorNodeType).toBe(3) // TEXT_NODE
  expect(probe.anchorInsidePanel).toBe(true)

  const floating = page.locator('.floating-ask')
  await expect(floating).toBeVisible()
  await expect(floating).toContainText('Ask about')
})