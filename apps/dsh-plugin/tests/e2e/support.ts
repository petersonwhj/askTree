/**
 * Shared driver for the AskTree panel specs.
 *
 * The panel talks to a model over a plain OpenAI-compatible endpoint, and the
 * app reads that endpoint from `localStorage.asktree_llm_config` on boot. So a
 * spec can seed the config before the page loads and answer the HTTP call with
 * `page.route`, which exercises the real prompt assembly, the real request
 * shape, and the real answer-rendering path without needing a model.
 *
 * @module asktree-dsh/tests/e2e/support
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/** Directory holding the fixture documents. */
export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Plain Markdown fixture: three paragraphs of prose. */
export const NOTES = `${FIXTURES}notes.md`

/** Markdown fixture exercising both LaTeX delimiter styles. */
export const MATH = `${FIXTURES}math.md`

/** Endpoint the seeded config points at; the spec intercepts this path. */
const STUB_ENDPOINT = 'http://127.0.0.1:5199/llm'

/** One intercepted model call. */
export interface LlmCall {
  /** Concatenated `messages[*].content`. */
  readonly prompt: string
  /** The parsed request body. */
  readonly body: { model?: string; messages?: Array<{ role?: string; content?: unknown }> }
  /** Whether the call came from the "suggest questions" feature. */
  readonly isSuggest: boolean
}

/** Boot options. */
export interface BootOptions {
  /** Seed a usable LLM config before the app loads. @default true */
  readonly llm?: boolean
}

/**
 * Mark a suggestion request. The app ships exactly one template that asks for
 * three questions, so the prompt itself is the discriminator.
 */
const SUGGEST_MARKER = 'propose exactly 3 short'

/**
 * Load the panel harness and fail loudly if the page threw on the way up.
 * @param page - the Playwright page.
 * @param options - boot options.
 * @returns collected page errors and console errors.
 */
export async function bootPanel(page: Page, options: BootOptions = {}): Promise<string[]> {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })

  // The app prefers the File System Access API; a native Save-As dialog is not
  // drivable, so take it away and let the anchor-download fallback run.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })

  if (options.llm !== false) {
    await page.addInitScript((endpoint: string) => {
      localStorage.setItem('asktree_llm_config', JSON.stringify({
        config: { endpoint, apiKey: 'test-key', model: 'stub-model' },
        provider: 'openai',
      }))
    }, STUB_ENDPOINT)
  }

  await page.goto('/')
  await page.waitForFunction(() => (window as unknown as { __ASK_READY__?: boolean }).__ASK_READY__ === true)
  await expect(page.locator('.asktree-dsh-scope .app-header')).toBeVisible()
  return problems
}

/**
 * Answer every model call with a canned reply and record the requests.
 * @param page - the Playwright page.
 * @param respond - maps one call to the assistant message content.
 * @returns the live list of intercepted calls.
 */
export async function stubLlm(
  page: Page,
  respond: (call: LlmCall) => string,
): Promise<LlmCall[]> {
  const calls: LlmCall[] = []
  await page.route('**/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as LlmCall['body']
    const prompt = (body.messages ?? [])
      .map((message) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content))
      .join('\n')
    const call: LlmCall = { prompt, body, isSuggest: prompt.includes(SUGGEST_MARKER) }
    calls.push(call)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: respond(call) } }] }),
    })
  })
  return calls
}

/** A responder that answers questions with a heading and suggests three questions. */
export function defaultResponder(answer = 'The **Calvin cycle** fixes carbon into glucose.'): (call: LlmCall) => string {
  return (call) => call.isSuggest
    ? 'What is carbon fixation?\nWhy does RuBisCO matter?\nHow is ATP consumed?'
    : answer
}

/**
 * Open a fixture document through the header's hidden file input.
 * @param page - the Playwright page.
 * @param fixture - absolute path to the document.
 */
export async function openDocument(page: Page, fixture: string = NOTES): Promise<void> {
  await page.locator('input[accept*=".md"]').first().setInputFiles(fixture)
  await expect(page.locator('.markdown-pane').first()).toBeVisible()
}

/**
 * Drag across an element, producing a real selection the way a user would.
 * @param page - the Playwright page.
 * @param target - a selector or an already-scoped locator.
 */
export async function dragSelect(page: Page, target: string | Locator): Promise<void> {
  const element = typeof target === 'string' ? page.locator(target).first() : target.first()
  const box = await element.boundingBox()
  expect(box, 'the drag target has no bounding box').not.toBeNull()
  const y = box!.y + box!.height / 2
  await page.mouse.move(box!.x + 4, y)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width - 4, y, { steps: 12 })
  await page.mouse.up()
}

/**
 * Select a passage, take the floating button, and send a question.
 * @param page - the Playwright page.
 * @param target - the element to select across.
 * @param question - the question to send.
 * @param answerMark - text only the stubbed answer contains.
 */
export async function askAbout(
  page: Page,
  target: string | Locator,
  question: string,
  answerMark = 'STUBANSWER',
): Promise<void> {
  await dragSelect(page, target)
  await expect(page.locator('.floating-ask')).toBeVisible()
  await page.locator('.floating-ask').click()
  await page.locator('.asktree-dsh-scope textarea').first().fill(question)
  await page.locator('.send-btn').click()
  await expect(page.locator('.markdown-pane').last()).toContainText(answerMark, { timeout: 20_000 })
}