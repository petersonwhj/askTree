import { test, expect } from "@playwright/test";

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("sends an attached image and keeps it after reload", async ({ page }) => {
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
  await page
    .locator('header input[accept=".md,.markdown,.txt,.docx"]')
    .setInputFiles({ name: "article.md", mimeType: "text/markdown", buffer: Buffer.from("# A\n\nbody") });

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(page.locator(".ask-image")).toHaveCount(1);

  await page.getByPlaceholder(/ask anything/i).fill("what is this?");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("STUB ANSWER")).toBeVisible();
  expect(sentBody).toContain("image_url");
  expect(sentBody).toContain("data:image/png;base64,");

  // Reload restores the document but only opens its root; open the answer node
  // from the sidebar again, then check the image is still there.
  await page.reload();
  await page.locator(".tree-node", { hasText: "what is this?" }).click();
  await expect(page.locator(".node-image")).toHaveCount(1);
});
