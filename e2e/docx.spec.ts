import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const FIXTURE = resolve(__dirname, "../apps/web/src/lib/__tests__/fixtures/sample.docx");

test("opens a .docx as a markdown document", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('header input[accept=".md,.markdown,.txt,.docx"]')
    .setInputFiles(FIXTURE);

  await expect(page.locator(".doc-row")).toHaveCount(1);
  await expect(page.locator(".doc-row .doc-kind")).toHaveText("docx");
  await expect(page.getByText("bold text")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Col A" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "a1" })).toBeVisible();
});
