import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Real screenshots of all five chapters at laptop / tablet / phone widths, plus an overflow assertion. Output: test-results/phase2/shots
const SHOTS = "test-results/phase2/shots";
const VIEWPORTS = { laptop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } } as const;
const CHAPTERS = [["inbox", "The Inbox"], ["trail", "Trail"], ["insider", "Insider"], ["containment", "Containment"], ["verdict", "Final Verdict"]] as const;

async function login(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Team ID").fill(id);
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  test(`screenshots + no horizontal overflow, ${device}`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(viewport);
    await login(page, "P2-MID-A");
    await page.screenshot({ path: `${SHOTS}/${device}-dashboard.png`, fullPage: true });
    for (const [slug, title] of CHAPTERS) {
      await page.goto(`/play/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/${device}-${slug}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${slug} overflows horizontally by ${overflow}px at ${device}`).toBeLessThanOrEqual(1);
    }
  });
}
