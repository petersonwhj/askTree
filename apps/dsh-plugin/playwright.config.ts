import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * Headless feature suite for the AskTree panel.
 *
 * The harness page serves the real built `lib/client.js` through a stand-in
 * Harness module loader, so a spec drives the same bytes the Harness ships and
 * needs no Harness install and no credentials.
 *
 * Run `pnpm e2e:setup` once on a bare Linux image: Chromium links
 * `libasound.so.2`, which slim images omit and which needs root to install
 * system-wide. The setup script extracts it into `.browser-libs/` instead.
 */
const here = dirname(fileURLToPath(import.meta.url))
const localLibs = join(here, '.browser-libs', 'root', 'usr', 'lib', 'x86_64-linux-gnu')
const browserLibs = process.env.ASKTREE_BROWSER_LIBS ?? (existsSync(localLibs) ? localLibs : undefined)

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: browserLibs === undefined
      ? {}
      : {
          env: {
            ...process.env,
            LD_LIBRARY_PATH: `${browserLibs}:${process.env.LD_LIBRARY_PATH ?? ''}`,
          },
        },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: 'http://127.0.0.1:5199/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})