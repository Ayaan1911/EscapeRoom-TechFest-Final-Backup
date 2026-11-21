import { expect, test } from "@playwright/test";

// Fast visual/responsive checks on a SEEDED disposable round (GHOST_P5_SEED=1 node scripts/phase5-e2e.mjs tests/phase5-visual.spec.ts).
// Independent of the lifecycle spec. Round 2 is at minute 10 of a test clock; nothing here starts a real timer.
const code = process.env.GHOST_E2E_TEAM_CODE!, origin = process.env.GHOST_BASE_URL ?? "http://127.0.0.1:3000", shots = process.env.GHOST_SHOTS === "1";
test.setTimeout(120_000);
const sizes = [["laptop", { width: 1366, height: 800 }], ["tablet", { width: 820, height: 1100 }], ["phone", { width: 390, height: 844 }]] as const;
for (const [name, vp] of sizes) {
  test(`Round 2 ${name}: stylesheet applied, no horizontal overflow, navigation usable`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: origin, viewport: vp }), page = await ctx.newPage();
    await page.goto("/login?next=/round2"); await page.getByLabel("Team ID").fill("P5-06"); await page.getByLabel("Access code").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Incidents and challenges" });
    await expect(nav).toBeVisible({ timeout: 60_000 });
    const css = await page.evaluate(() => ({ top: getComputedStyle(document.querySelector(".r2-top")!).display, bg: getComputedStyle(document.querySelector(".r2-top")!).backgroundColor, nav: getComputedStyle(document.querySelector(".r2-nav")!).position }));
    expect(["grid", "flex"]).toContain(css.top); expect(css.bg).not.toBe("rgba(0, 0, 0, 0)"); expect(css.nav).toBe("sticky");
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await over()).toBeLessThanOrEqual(1);
    await nav.getByRole("button", { name: /Incident 2/ }).click({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Connection map" })).toBeVisible();
    expect(await over(), "Incident 2 overflow").toBeLessThanOrEqual(1);
    if (shots) await page.screenshot({ path: `test-results/phase5/shots/v-${name}-incident2.jpg`, type: "jpeg", quality: 55 });
    await nav.getByRole("button", { name: /Incident 1/ }).click();
    await expect(page.getByText("Triage six observations")).toBeVisible();
    expect(await over(), "Incident 1 overflow").toBeLessThanOrEqual(1);
    if (shots) await page.screenshot({ path: `test-results/phase5/shots/v-${name}-incident1.jpg`, type: "jpeg", quality: 55 });
    await ctx.close();
  });
}
