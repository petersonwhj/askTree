import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const FIXTURE = resolve(__dirname, "../apps/web/public/samples/sample.pdf");

test("opens a PDF, crops a region, asks with page context, and keeps it after reload", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "asktree_llm_config",
      JSON.stringify({
        config: { endpoint: "http://localhost:5173/fake-llm", model: "test", apiKey: "x" },
        provider: "openai",
      }),
    );
  });

  let sentBody = "";
  await page.route("**/fake-llm/**", async (route) => {
    sentBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ choices: [{ message: { content: "STUB ANSWER" } }] }),
    });
  });

  await page.goto("/");

  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

  await page
    .locator('header input[accept=".md,.markdown,.txt,.docx,.pdf"]')
    .setInputFiles(FIXTURE);

  await expect(page.locator(".doc-row .doc-kind")).toHaveText("pdf");
  const canvas = page.locator(".pdf-pane canvas");
  await expect(canvas).toBeVisible();
  // The canvas exists before the document is parsed; wait until the page count
  // is known so the crop is drawn on a rendered page.
  await expect(page.locator(".pdf-page-indicator")).toHaveText("1 / 2");

  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 140);
  await page.mouse.up();
  await page.getByRole("button", { name: "Ask about this" }).click();

  await expect(page.locator(".context-capture")).toBeVisible();

  await page.getByPlaceholder(/ask anything/i).fill("what does this say?");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("STUB ANSWER")).toBeVisible();
  expect(sentBody).toContain("Selected region");
  expect(sentBody).toContain("Page 1");
  const imageCount = (sentBody.match(/image_url/g) ?? []).length;
  expect(imageCount).toBeGreaterThanOrEqual(2);

  await page.reload();
  await page.locator(".tree-node", { hasText: "what does this say?" }).click();
  await expect(page.locator(".node-image")).toHaveCount(1);
});
