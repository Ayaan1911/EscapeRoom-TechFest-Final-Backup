import { expect, test, type Page } from "@playwright/test";

// GHOST//OS window manager (Journey C). Uses organizer Demo Mode so no team state is involved. Run via scripts/phase5-e2e.mjs.
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
async function organizer(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
}
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); }); // no open animation while geometry is measured
const win = (page: Page, id: string) => page.locator(`[data-window="${id}"]`);
const dock = (page: Page, id: string) => page.locator(`.os-dock-btn[data-app="${id}"]`);
const box = async (page: Page, id: string) => (await win(page, id).boundingBox())!;
const z = (page: Page, id: string) => win(page, id).evaluate(e => Number(getComputedStyle(e).zIndex));
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up(); }
async function openTrail(page: Page) { await page.goto("/admin/demo/round1/trail"); await expect(page.getByRole("heading", { name: "Trail", exact: true })).toBeVisible(); }

test("default view is an overview, not a log wall; the dock offers the chapter's tools", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await organizer(page); await openTrail(page);
  await expect(dock(page, "console")).toBeVisible(); await expect(dock(page, "inspector")).toBeVisible(); await expect(dock(page, "records")).toBeVisible();
  await expect(page.locator("[data-window]")).toHaveCount(0);
  await expect(page.locator(".pg-table tbody tr")).toHaveCount(0); // the 144 raw events are not on screen until the console is opened
  await expect(page.locator(".ds-tl-dot").first()).toBeVisible(); // the investigation overview (timeline) is
  await dock(page, "console").click(); await expect(win(page, "console")).toBeVisible(); await expect(page.locator(".pg-table tbody tr")).toHaveCount(25);
});

test("drag, bounds, focus order, minimize/restore, resize, close", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await organizer(page); await openTrail(page);
  await dock(page, "console").click(); await page.locator(".ds-tl-dot").nth(2).click(); // marker click opens the inspector too
  await expect(win(page, "inspector")).toBeVisible();
  // focus: the most recently used window is in front
  expect(await z(page, "inspector")).toBeGreaterThan(await z(page, "console"));
  await win(page, "console").locator(".os-win-body").click({ position: { x: 5, y: 5 } }); expect(await z(page, "console")).toBeGreaterThan(await z(page, "inspector"));
  // drag by the title bar
  const before = await box(page, "console"), bar = win(page, "console").locator(".os-win-bar"), b = (await bar.boundingBox())!;
  await drag(page, { x: b.x + 120, y: b.y + 20 }, { x: b.x + 220, y: b.y + 50 });
  const moved = await box(page, "console"); expect(Math.round(moved.x - before.x)).toBe(100); expect(Math.round(moved.y - before.y)).toBe(30);
  // a window can never be dragged out of reach: far off-screen is clamped inside the viewport, below the system bar and above the dock
  const b2 = (await bar.boundingBox())!; await drag(page, { x: b2.x + 120, y: b2.y + 20 }, { x: -900, y: -900 });
  let c = await box(page, "console"); expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(56);
  const b3 = (await bar.boundingBox())!; await drag(page, { x: b3.x + 120, y: b3.y + 20 }, { x: 3000, y: 3000 });
  c = await box(page, "console"); expect(c.x + c.width).toBeLessThanOrEqual(1366); expect(c.y + c.height).toBeLessThanOrEqual(768 - 60);
  // resize by the grip
  const g = (await win(page, "console").locator(".os-win-grip").boundingBox())!, w0 = (await box(page, "console")).width;
  await drag(page, { x: g.x + 8, y: g.y + 8 }, { x: g.x - 60, y: g.y - 40 }); expect((await box(page, "console")).width).toBeLessThan(w0);
  // minimize / restore
  await win(page, "console").getByRole("button", { name: "Minimize Event console" }).click(); await expect(win(page, "console")).toBeHidden(); await expect(dock(page, "console")).toHaveClass(/is-min/);
  await dock(page, "console").click(); await expect(win(page, "console")).toBeVisible();
  // close
  await win(page, "inspector").getByRole("button", { name: "Close Event inspector" }).click(); await expect(win(page, "inspector")).toHaveCount(0); await expect(dock(page, "inspector")).toHaveAttribute("aria-pressed", "false");
});

test("keyboard: arrows move, Shift+arrows resize, Escape closes; reset closes everything", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await organizer(page); await openTrail(page);
  await dock(page, "records").click(); const handle = win(page, "records").locator(".os-win-title"); await handle.focus();
  const a = await box(page, "records"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
  const m = await box(page, "records"); expect(Math.round(m.x - a.x)).toBe(16); expect(Math.round(m.y - a.y)).toBe(16);
  await page.keyboard.press("Shift+ArrowRight"); expect(Math.round((await box(page, "records")).width - m.width)).toBe(16);
  await page.keyboard.press("Escape"); await expect(win(page, "records")).toHaveCount(0);
  await dock(page, "console").click(); await dock(page, "inspector").click(); await expect(page.locator("[data-window]")).toHaveCount(2);
  await page.getByRole("button", { name: "Reset window layout" }).click(); await expect(page.locator("[data-window]")).toHaveCount(0);
});

test("refresh restores the layout (UI geometry only), and the window cannot restore outside a smaller viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await organizer(page); await openTrail(page);
  await dock(page, "console").click(); const b = (await win(page, "console").locator(".os-win-bar").boundingBox())!; await drag(page, { x: b.x + 120, y: b.y + 20 }, { x: b.x + 320, y: b.y + 120 });
  const placed = await box(page, "console");
  await page.reload(); await expect(win(page, "console")).toBeVisible(); const again = await box(page, "console"); expect(Math.round(again.x)).toBe(Math.round(placed.x)); expect(Math.round(again.y)).toBe(Math.round(placed.y));
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([k]) => k.startsWith("ghostos.windows")).map(([, v]) => v).join("|"));
  expect(stored).not.toMatch(/EV-|account|session|answer|score/i); // layout flags only, never evidence or game data
  await page.setViewportSize({ width: 900, height: 600 }); await expect.poll(async () => { const r = await box(page, "console"); return r.x + r.width <= 900 && r.y + r.height <= 600; }).toBe(true);
});

test("phone/tablet: windows become full-width sheets with the same controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await organizer(page); await openTrail(page);
  await dock(page, "console").click(); const sheet = win(page, "console"); await expect(sheet).toHaveClass(/is-sheet/);
  const r = await box(page, "console"); expect(r.x).toBeLessThanOrEqual(8); expect(r.width).toBeGreaterThanOrEqual(370);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await sheet.getByRole("button", { name: "Close Event console" }).click(); await expect(sheet).toHaveCount(0);
});
