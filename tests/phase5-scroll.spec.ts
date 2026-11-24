import { expect, test, type Page } from "@playwright/test";

// Scroll-model guard (owner complaint: too many independently scrolling panels). Demo Mode at 1366x768 (no team data touched).
// For every Round 1 chapter and Round 2 inject: count elements that scroll on their own (overflow auto/scroll AND content taller than the box),
// excluding tool windows (opened on demand) and the Kill Switch terminal output (the one deliberate inner scroll region on that page),
// and check that a mouse wheel over the main workspace moves the page (no wheel trap).
const code = () => process.env.GHOST_E2E_ADMIN_CODE!;
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible(); }
const PAGES = [
  ["inbox", "/admin/demo/round1/inbox", ".pg-bench"], ["trail", "/admin/demo/round1/trail", ".pg-console"], ["insider", "/admin/demo/round1/insider", ".pg-board"],
  ["containment", "/admin/demo/round1/containment", ".rm"], ["verdict", "/admin/demo/round1/verdict", ".cn-board"],
  ["r2-alert", "/admin/demo/round2?unit=1", ".ij-1"], ["r2-killswitch", "/admin/demo/round2?unit=2", ".ks"], ["r2-audit", "/admin/demo/round2?unit=3", ".ij-3"], ["r2-calls", "/admin/demo/round2?unit=4", ".ij-4"],
] as const;
export const innerScrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main *")].filter(e => {
  if (e.closest("[data-window], .ks-log")) return false; // tool windows and the terminal output are allowed to scroll
  const s = getComputedStyle(e), y = s.overflowY;
  return (y === "auto" || y === "scroll") && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 40;
}).map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 2).join(".")}`));


test.use({ viewport: { width: 1366, height: 768 } });
for (const [name, path, area] of PAGES) test(`${name}: no nested vertical scroll regions; the wheel over the workspace scrolls the page`, async ({ page }) => {
  await organizer(page); await page.goto(path, { waitUntil: "networkidle" });
  const inner = await innerScrollers(page);
  expect(inner, `independently scrolling regions on ${name}: ${inner.join(", ")}`).toEqual([]);
  const box = await page.locator(area).first().boundingBox(); expect(box).not.toBeNull();
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(box!.x + box!.width / 2, Math.min(box!.y + 40, 700)); await page.mouse.wheel(0, 500); await page.waitForTimeout(400);
  const after = await page.evaluate(() => scrollY);
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  if (room > 50) expect(after, `wheel over ${area} did not move the page`).toBeGreaterThan(before);
});
