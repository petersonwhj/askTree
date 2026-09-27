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
  await expect(page.locator(".pdf-page-total")).toHaveText("/ 2");

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
  // Count real image parts (the string "image_url" appears twice per image).
  const payload = JSON.parse(sentBody);
  const userMessage = payload.messages.find((m: { role: string }) => m.role === "user");
  const imageParts = (userMessage.content as Array<{ type: string }>).filter(
    (part) => part.type === "image_url",
  ).length;
  // The crop plus the current page and its neighbours.
  expect(imageParts).toBe(3);
  expect(sentBody).toContain("Page 1");

  await page.reload();
  await page.locator(".tree-node", { hasText: "what does this say?" }).click();
  await expect(page.locator(".node-image")).toHaveCount(1);
});

test("warns instead of showing a blank pane when the file is not a valid PDF", async ({ page }) => {
  await page.goto("/");
  await page.locator('header input[accept=".md,.markdown,.txt,.docx,.pdf"]').setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is definitely not a pdf"),
  });

  await expect(page.locator(".doc-row .doc-kind")).toHaveText("pdf");
  await expect(page.locator(".pdf-error")).toBeVisible();
  await expect(page.locator(".pdf-error")).toContainText("not a valid PDF");
});

test("opening a Markdown file after a PDF keeps the app working", async ({ page }) => {
  await page.goto("/");
  const fileInput = 'header input[accept=".md,.markdown,.txt,.docx,.pdf"]';

  await page.locator(fileInput).setInputFiles(FIXTURE);
  await expect(page.locator(".pdf-page-total")).toHaveText("/ 2");

  await page.locator(fileInput).setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Notes\n\nhello there"),
  });

  await expect(page.locator(".doc-row")).toHaveCount(2);
  await expect(page.locator(".pdf-error")).toHaveCount(0);
  await expect(page.getByText("hello there")).toBeVisible();
});

test("shows a PDF-derived answer as Markdown when that node is open", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "asktree_llm_config",
      JSON.stringify({
        config: { endpoint: "http://localhost:5173/fake-llm", model: "t", apiKey: "x" },
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
  await page.locator('header input[accept=".md,.markdown,.txt,.docx,.pdf"]').setInputFiles(FIXTURE);
  await expect(page.locator(".pdf-page-total")).toHaveText("/ 2");

  const box = (await page.locator(".pdf-pane canvas").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 140);
  await page.mouse.up();
  await page.getByRole("button", { name: "Ask about this" }).click();
  await page.getByPlaceholder(/ask anything/i).fill("what does this say?");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText("STUB ANSWER")).toBeVisible();

  // Focus the answer node from the sidebar: the left pane must show Markdown, not the PDF.
  await page.locator(".tree-node", { hasText: "what does this say?" }).click();
  await expect(page.locator(".pdf-pane")).toHaveCount(0);
  await expect(page.getByText("STUB ANSWER")).toBeVisible();
});
