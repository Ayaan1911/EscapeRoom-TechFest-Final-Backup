import { expect, test } from "@playwright/test";

test("Phase 0 routes show their shell content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A breach has a story/i })).toBeVisible();
  await page.getByRole("link", { name: /Enter investigation/i }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Investigation chapters" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
});
