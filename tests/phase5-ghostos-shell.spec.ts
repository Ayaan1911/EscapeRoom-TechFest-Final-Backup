import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// GHOST//OS shell (named phase5-* so it only runs under scripts/phase5-e2e.mjs, which seeds P5-* teams): one system bar everywhere, offline guarantee (no third-party requests), non-blocking boot reveal, accessibility, generic login errors.
// Run through scripts/phase5-e2e.mjs (disposable database, seeded teams P5-01..).
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const axeSrc = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
async function team(page: Page, id = "P5-01") {
  await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/);
}
const bar = (page: Page) => page.locator("header.os-bar");

test("every screen carries the same GHOST//OS system bar (and only one)", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  for (const [path, area] of [["/", "Operation briefing"], ["/login", "Secure access"], ["/organizer/login", "Organizer access"]] as const) {
    await page.goto(path); await expect(bar(page)).toHaveCount(1); await expect(bar(page)).toContainText("GHOST//OS"); await expect(bar(page)).toContainText(area);
  }
  await team(page);
  for (const [path, area] of [["/play", "Mission map"], ["/play/inbox", "Inbox"], ["/play/trail", "Trail"]] as const) {
    await page.goto(path); await expect(bar(page)).toHaveCount(1); await expect(bar(page)).toContainText(area); await expect(bar(page)).toContainText("Secure session");
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  }
  await ctx.close();
});

test("the system bar never covers content: the page body starts below it on laptop and phone widths", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage(); await team(page);
  for (const [w, h] of [[1366, 768], [1920, 1080], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h }); await page.goto("/play");
    const m = await page.evaluate(() => ({ bar: document.querySelector("header.os-bar")!.getBoundingClientRect(), main: document.querySelector("main")!.getBoundingClientRect(), over: document.documentElement.scrollWidth - window.innerWidth }));
    expect(m.bar.height, `bar height at ${w}`).toBeLessThanOrEqual(72); expect(m.main.top, `main below bar at ${w}`).toBeGreaterThanOrEqual(m.bar.bottom - 1); expect(m.over, `no horizontal scroll at ${w}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test("offline guarantee: pages and chapters request nothing outside the app origin", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage(); const foreign = new Set<string>();
  const base = new URL(test.info().project.use.baseURL!).origin;
  page.on("request", r => { const u = new URL(r.url()); if (["http:", "https:"].includes(u.protocol) && u.origin !== base) foreign.add(u.origin); });
  await page.goto("/"); await page.goto("/login"); await team(page);
  for (const p of ["/play", "/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"]) { await page.goto(p); await page.waitForLoadState("networkidle"); }
  await ctx.close(); expect([...foreign]).toEqual([]);
});

test("the boot reveal never blocks input and disappears under reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto("/");
  expect(await page.locator(".os-boot").evaluate(e => getComputedStyle(e).pointerEvents)).toBe("none"); // input passes straight through
  await page.getByRole("link", { name: "Team login" }).first().click({ timeout: 3000 }); await expect(page).toHaveURL(/\/login/); await ctx.close();
  const rm = await browser.newContext({ reducedMotion: "reduce" }), p2 = await rm.newPage(); await p2.goto("/");
  expect(await p2.locator(".os-boot").evaluate(e => getComputedStyle(e).display)).toBe("none"); await rm.close();
});

test("login failures are generic: an unknown team and a real team with a wrong code get the identical message", async ({ page }) => {
  await page.goto("/login"); await page.getByLabel("Team ID").fill("NOT-A-TEAM"); await page.getByLabel("Access code").fill("definitely-wrong-code"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const a = page.locator("p[role=alert]"); await expect(a).toContainText("Access denied"); const wrongUnknown = await a.innerText();
  await page.getByLabel("Team ID").fill("P5-02"); await page.getByLabel("Access code").fill("definitely-wrong-code"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Access denied"); expect(await page.locator("p[role=alert]").innerText()).toBe(wrongUnknown); // identical for an existing team
});

test("accessibility (WCAG A/AA) on landing, login and the dashboard", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage(); const problems: string[] = [];
  const scan = async (label: string) => { await page.evaluate(axeSrc); const v = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(x => `${x.id}(${x.nodes.length})`)); if (v.length) problems.push(`${label}: ${v.join(", ")}`); };
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/"); await page.waitForTimeout(1600); await scan("landing"); // wait out the 1.4 s boot reveal so contrast is measured on the real page
  await page.goto("/login"); await scan("login"); await team(page); await page.goto("/play"); await scan("dashboard");
  expect(problems).toEqual([]); await ctx.close();
});

test("organizer control center: the event pipeline shows Round 1, qualification and Round 2 from real state; teams cannot see it", async ({ browser }) => {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
  const pipe = page.getByRole("list", { name: "Event status" }); await expect(pipe.locator("li")).toHaveCount(3);
  await expect(pipe.locator("li").nth(0)).toContainText("Round 1"); await expect(pipe.locator("li").nth(0)).toContainText("Finished"); // the phase5 seed finishes Round 1
  await expect(pipe.locator("li").nth(1)).toContainText("Qualification"); await expect(pipe.locator("li").nth(2)).toContainText("Round 2");
  await pipe.getByRole("link", { name: /Ready|Not started|Chapter|Complete/ }).click(); await expect(page).toHaveURL(/\/admin\/round2/);
  await ctx.close();
  const t = await browser.newContext(), tp = await t.newPage(); await team(tp); await tp.goto("/admin"); await expect(tp).toHaveURL(/organizer\/login/); await expect(tp.getByRole("list", { name: "Event status" })).toHaveCount(0); await t.close();
});
