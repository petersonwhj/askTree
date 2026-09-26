import { test, expect, type Page } from "@playwright/test";

const mdInput = (page: Page) => page.locator('header input[accept=".md,.markdown,.txt,.docx"]');

async function openDoc(page: Page, name: string, body: string) {
  await mdInput(page).setInputFiles({
    name: `${name}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(body),
  });
}

test("opens multiple documents and highlights the newest", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nfirst article");
  await expect(page.locator(".doc-row")).toHaveCount(1);

  await openDoc(page, "beta", "# Beta\n\nsecond article");
  await expect(page.locator(".doc-row")).toHaveCount(2);
  await expect(page.locator(".doc-row", { hasText: "beta" })).toHaveClass(/active/);
  await expect(page.locator(".doc-row", { hasText: "alpha" })).not.toHaveClass(/active/);
});

test("switches documents without losing their content", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nfirst article");
  await openDoc(page, "beta", "# Beta\n\nsecond article");
  await expect(page.getByText("second article")).toBeVisible();

  await page.locator(".doc-row", { hasText: "alpha" }).click();
  await expect(page.locator(".doc-row", { hasText: "alpha" })).toHaveClass(/active/);
  await expect(page.getByText("first article")).toBeVisible();
});

test("renames a document and persists the name across reload", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");

  // Target the row by its action button, not its text: renaming swaps the title
  // text for an input value, so a hasText locator would stop matching.
  const row = page.locator(".doc-row").filter({ has: page.getByLabel("Rename alpha") });
  await row.hover();
  await row.getByLabel("Rename alpha").click();
  const input = page.locator(".doc-rename-input");
  await input.fill("Renamed");
  await input.press("Enter");

  await expect(page.locator(".doc-row", { hasText: "Renamed" })).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".doc-row", { hasText: "Renamed" })).toHaveCount(1);
});

test("exports the active document and imports it as a new one", async ({ page }) => {
  // Headless Chrome exposes showSaveFilePicker, which would open a picker
  // instead of downloading. Force the classic download path so it can be captured.
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
  });

  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Tree" }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.locator('header input[accept=".json"]').setInputFiles(path!);
  await expect(page.locator(".doc-row")).toHaveCount(2);
});

test("deletes documents, and deleting the last returns to the welcome screen", async ({ page }) => {
  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nbody");
  await openDoc(page, "beta", "# Beta\n\nbody");

  const beta = page.locator(".doc-row", { hasText: "beta" });
  await beta.hover();
  await beta.getByLabel("Delete beta").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".doc-row")).toHaveCount(1);

  const alpha = page.locator(".doc-row", { hasText: "alpha" });
  await alpha.hover();
  await alpha.getByLabel("Delete alpha").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".doc-row")).toHaveCount(0);
  await expect(page.getByText("Welcome to AskTree")).toBeVisible();
});

test("keeps each document's questions separate", async ({ page }) => {
  // Point the LLM at a same-origin path and intercept it, so no real model is called.
  await page.addInitScript(() => {
    localStorage.setItem(
      "asktree_llm_config",
      JSON.stringify({
        config: { endpoint: "http://localhost:5173/fake-llm", model: "test", apiKey: "x" },
        provider: "openai",
      }),
    );
  });
  await page.route("**/fake-llm/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ choices: [{ message: { content: "STUB ANSWER" } }] }),
    }),
  );

  await page.goto("/");
  await openDoc(page, "alpha", "# Alpha\n\nalpha passage");
  await openDoc(page, "beta", "# Beta\n\nbeta passage");

  // Free ask on the active document (beta).
  await page.getByPlaceholder(/ask anything/i).fill("beta question");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText("STUB ANSWER")).toBeVisible();

  // Alpha has no questions; beta keeps its own.
  await page.locator(".doc-row", { hasText: "alpha" }).click();
  await expect(page.locator(".tree-node", { hasText: "beta question" })).toHaveCount(0);
  await page.locator(".doc-row", { hasText: "beta" }).click();
  await expect(page.locator(".tree-node", { hasText: "beta question" })).toHaveCount(1);
});
