import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.GHOST_E2E_TRAIL, "Run npm run test:e2e:trail for isolated fixtures (TRAIL-A completed Inbox; TRAIL-FRESH has no progress)");
async function login(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
}
const next = (page: Page) => page.getByRole("link", { name: "Open Chapter 2 →", exact: true });

test("a team that has not completed the chapter sees no Continue action", async ({ page }) => {
  await login(page, "TRAIL-FRESH");
  await page.goto("/play/inbox"); await expect(page.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible();
  await expect(next(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Open Chapter 2/ })).toHaveCount(0);
});

test("completed chapter on a phone: the Open Chapter 2 action is reachable, keyboard-focusable and only navigates on tap", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), page = await context.newPage();
  await login(page, "TRAIL-A");
  await page.goto("/play/inbox"); await expect(page.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible();
  const link = next(page); await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded(); const box = (await link.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); expect(box.height).toBeGreaterThanOrEqual(44);
  await link.focus(); expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(1500); expect(new URL(page.url()).pathname).toBe("/play/inbox"); // never navigates by itself
  await page.reload(); await expect(next(page)).toBeVisible(); // persists across refresh
  await next(page).tap(); await expect(page).toHaveURL(/\/play\/trail$/);
  await context.close();
});
