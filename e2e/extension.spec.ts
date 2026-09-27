import { test as base, chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "..");
const EXT = resolve(REPO, "apps/extension/dist-test");

// The toolbar click cannot be scripted, so the extension under test is built
// with a localhost host permission; the shipped manifest stays minimal.
base.beforeAll(() => {
  execFileSync("node", ["apps/extension/scripts/build.mjs", "--test"], { cwd: REPO, stdio: "inherit" });
});

const test = base.extend<{ context: import("@playwright/test").BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
  },
});

test("clips a page into a new tab's forest", async ({ context }) => {
  test.setTimeout(120_000);

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  await context.newPage();
  const page = context.pages()[context.pages().length - 1];
  await page.goto("http://localhost:5173/askTree/e2e-clip-fixture.html");

  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((t) => t.url?.includes("e2e-clip-fixture"));
    await (globalThis as { __asktreeClipActiveTab?: (t: unknown) => Promise<void> })
      .__asktreeClipActiveTab?.(target);
  });

  const app = await context.waitForEvent("page");
  await app.waitForLoadState();
  await expect(app.locator(".doc-row")).toHaveCount(1);
  await expect(app.locator(".doc-row")).toContainText("Clipped Article");
  expect(app.url()).toContain(`chrome-extension://${extensionId}/index.html`);
});

test("a local PDF focuses the open app tab and shows a notice", async ({ context }) => {
  test.setTimeout(120_000);

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const app = await context.newPage();
  await app.goto(`chrome-extension://${extensionId}/index.html`);
  await app.waitForLoadState();
  const openTabs = context.pages().length;

  await worker.evaluate(async () => {
    await (globalThis as { __asktreeClipActiveTab?: (t: unknown) => Promise<void> })
      .__asktreeClipActiveTab?.({ id: 424242, url: "file:///home/me/scan.pdf", title: "scan.pdf" });
  });

  await expect(app.locator(".settings-modal")).toContainText("Download the PDF");
  expect(context.pages().length).toBe(openTabs); // reused the open tab, opened no new one
});

test("the extension page can use WebAssembly (pdf.js decoders)", async ({ context }) => {
  test.setTimeout(120_000);

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  // The default MV3 CSP blocks WebAssembly, which silently breaks pdf.js's
  // JBIG2/JPEG2000 decoders (scanned pages render blank). The manifest allows
  // 'wasm-unsafe-eval' for exactly this.
  const result = await page.evaluate(async () => {
    try {
      await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return "ok";
    } catch (e) {
      return `blocked: ${(e as Error).message}`;
    }
  });
  expect(result).toBe("ok");
});
