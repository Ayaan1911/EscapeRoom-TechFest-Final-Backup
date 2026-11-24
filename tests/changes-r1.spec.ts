import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Targeted checks for: Trail event feed, in-app Forensic Snapshot, Top 12 projector.
// Run: node scripts/redesign-e2e.mjs tests/changes-r1.spec.ts   (disposable local database; Round 1 active; UI-A..D fixtures; nothing real is touched)
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/changes-r1.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/changes"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
test.afterAll(async () => { await prisma.$disconnect(); });
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); }
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("Trail: readable event feed under the timeline, synchronized with slice, marker and row", async ({ browser }) => {
  test.setTimeout(180_000);
  const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id: "UI-A" } })).progress); p.chapters[0].score = 15; p.chapters[0].unlockedAt = 1; p.chapters[1].unlockedAt = 1;
  await prisma.team.update({ where: { id: "UI-A" }, data: { progress: JSON.stringify(p) } });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await ctx.newPage(), problems: string[] = [];
  page.on("pageerror", e => problems.push(e.message)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await team(page, "UI-A"); await page.goto("/play/trail");
  const feed = page.getByRole("region", { name: "Event feed" }), rows = feed.locator("li.tf-row");
  await expect(feed).toBeVisible({ timeout: 20_000 });
  const summary = (await page.locator(".pg-outcomes").innerText()).replace(/\s+/g, " "), total = Number(/of (\d+) events/.exec(summary)![1]); expect(total).toBeGreaterThanOrEqual(100);
  await expect(rows).toHaveCount(30); await expect(feed.getByRole("status")).toContainText(`30 of ${total} shown`); // readable immediately: no click on any marker needed
  const first = rows.first(); await expect(first.locator(".tf-time")).toHaveText(/^\d\d:\d\d:\d\d$/); await expect(first.locator(".tf-type")).not.toBeEmpty(); await expect(first.locator(".tf-who")).toContainText("@"); await expect(first.locator(".tf-src")).toHaveText(/\d+\.\d+\.\d+\.\d+/); await expect(first.locator(".tf-desc")).not.toBeEmpty();
  await expect(first.locator(".k-badge")).toContainText(/Allowed|Denied|Challenged/); // text label + icon, not colour alone
  const feedText = await feed.innerText(); expect(feedText).not.toMatch(/ignore session|Accuse|UNTRUSTED|ANALYST_NOTE|approved change|CHG-219|not an authorization|unregistered-browser|untrusted-agent/i); // no free-text details or per-event policy wording
  await page.screenshot({ path: `${SHOTS}/trail-1-default.png`, fullPage: true });

  const t0 = Date.now(); await feed.getByRole("button", { name: `Show all ${total}` }).click(); await expect(rows).toHaveCount(total); expect(Date.now() - t0).toBeLessThan(3000); // all events stay available; 144 rows render promptly
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  const ids = await rows.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.ev!)); expect(new Set(ids).size).toBe(total); // each event once
  const markers = await page.locator("button.ds-tl-dot").evaluateAll(els => els.map(e => (e.getAttribute("aria-label") ?? "").split(",")[0].replace("Timeline marker ", ""))); expect(markers.sort()).toEqual([...ids].sort()); // markers and rows are the same records
  await page.screenshot({ path: `${SHOTS}/trail-2-all-events.png`, fullPage: true });

  // time slice: the feed follows the timeline's zoom, and "whole night" restores everything
  const bar = page.getByRole("group", { name: /Activity overview/ }).locator("button:not([disabled])").nth(3); const label = (await bar.getAttribute("aria-label"))!, n = Number(/(\d+) event/.exec(label)![1]);
  await bar.click(); await expect(page.locator(".gx-tl-zoom")).toContainText("Zoomed to"); await expect(rows).toHaveCount(n); await expect(feed.getByRole("status")).toContainText(`${n} of ${n} shown`); await expect(feed.getByRole("status")).toContainText(`${total} in the whole night`);
  const visibleIds = await rows.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.ev!)); const zoomMarkers = await page.locator("button.ds-tl-dot").count(); expect(zoomMarkers).toBe(n); expect(visibleIds.length).toBe(n);
  await page.screenshot({ path: `${SHOTS}/trail-3-slice.png`, fullPage: true });
  await page.getByRole("button", { name: "Show the whole night" }).click(); await expect(feed.getByRole("status")).toContainText(`of ${total} shown`); await expect(feed.getByRole("status")).not.toContainText("in the whole night");

  // a feed row highlights its marker; a marker highlights its row and opens the inspector
  const row = rows.nth(5), rowId = (await row.getAttribute("data-ev"))!; await row.locator(".tf-main").click();
  await expect(row).toHaveClass(/is-selected/); await expect(page.locator(`button.ds-tl-dot[aria-label^="Timeline marker ${rowId},"]`)).toHaveAttribute("aria-pressed", "true");
  const marker = page.locator("button.ds-tl-dot").nth(40), markerId = ((await marker.getAttribute("aria-label")) ?? "").split(",")[0].replace("Timeline marker ", ""); await marker.click({ force: true });
  await expect(feed.locator(`li[data-ev="${markerId}"]`)).toHaveClass(/is-selected/); await expect(page.getByRole("complementary", { name: "Selected event details" })).toContainText(markerId);
  // keyboard: Tab reaches a row, Enter selects it
  await feed.locator("li.tf-row").nth(8).locator(".tf-main").focus(); await page.keyboard.press("Enter"); await expect(feed.locator("li.tf-row").nth(8)).toHaveClass(/is-selected/);
  expect(await overflow(page)).toBeLessThanOrEqual(1); expect(problems).toEqual([]); await ctx.close();
});

test("Forensic Snapshot: direct in-app button replaces the QR card; evidence opens from the player's PC", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await ctx.newPage(), origins = new Set<string>();
  page.on("request", r => origins.add(new URL(r.url()).origin));
  await team(page, "UI-A"); await page.goto("/play/inbox");
  const panel = page.locator(".pg-qr"); await expect(panel).toContainText("Forensic Snapshot"); await expect(panel).toContainText("Open the archived forensic capture and inspect the evidence.");
  await expect(panel).not.toContainText(/QR|printed|scan|card kit/i); await expect(page.locator("body")).not.toContainText(/printed QR|QR forensic|card kit/i);
  await page.screenshot({ path: `${SHOTS}/snapshot-1-inbox-button.png` });
  const link = page.getByRole("link", { name: "Open Forensic Snapshot" }); expect(await link.getAttribute("target")).toBeNull(); await link.click(); // same tab: the player stays inside GHOST//OS
  await expect(page).toHaveURL(/\/clue\/inbox$/); await expect(page.getByRole("heading", { name: "Captured authentication page" })).toBeVisible(); await expect(page.locator("body")).toContainText("CAP-A-17"); await expect(page.locator("body")).toContainText("Captured URL"); await expect(page.locator("body")).toContainText("Observed recipient");
  await expect(page.locator("body")).not.toContainText(/scan|QR/i); await expect(page.locator("input, form, iframe")).toHaveCount(0); await expect(page.getByText("GHOST//OS")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1); await page.screenshot({ path: `${SHOTS}/snapshot-2-opened.png`, fullPage: true });
  await page.getByRole("link", { name: /Return to Inbox/ }).click(); await expect(page).toHaveURL(/\/play\/inbox$/); await expect(page.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible();
  expect([...origins].every(o => o === "http://127.0.0.1:3000")).toBe(true); // nothing external
  for (const path of ["/admin/inbox-kit", "/admin/demo/round1/inbox/snapshot", "/admin/insider-kit"]) { await page.goto(path); await expect(page).toHaveURL(/\/organizer\/login/); await expect(page.locator("body")).not.toContainText(/NEXUS Workspace|physical evidence kit|Insider Evidence Wall kit/); } // organizer resources stay protected from a team session
  await ctx.close();
  // the organizer's Demo Mode opens the same evidence without touching a team
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), demo = await dctx.newPage(); await organizer(demo);
  await demo.goto("/admin/demo/round1/inbox?v=B"); await expect(demo.locator(".pg-qr")).toContainText("Forensic Snapshot"); await demo.getByRole("link", { name: "Open Forensic Snapshot" }).click();
  await expect(demo).toHaveURL(/\/admin\/demo\/round1\/inbox\/snapshot\?v=B/); await expect(demo.locator("body")).toContainText("CAP-B-17"); await demo.getByRole("link", { name: /Return to Inbox/ }).first().click(); await expect(demo).toHaveURL(/\/admin\/demo\/round1\/inbox\?v=B/);
  await dctx.close();
});

test("Projector: Top 12 is the main content, the timer is compact and on top, publication rules hold", async ({ browser }) => {
  test.setTimeout(240_000);
  // 14 real fixture teams with distinct totals and one tie (PJ-05 and PJ-06)
  for (let i = 1; i <= 14; i++) {
    const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id: "UI-D" } })).progress); p.chapters[0].score = 15; p.chapters[1].score = 25; p.chapters[2].score = i === 6 ? 20 : 25 - i; p.chapters[0].completedAt = 1;
    await prisma.team.create({ data: { id: `PJ-${String(i).padStart(2, "0")}`, name: `Projector Team ${String(i).padStart(2, "0")}`, participants: "[]", codeHash: "x", variant: "A", progress: JSON.stringify(p) } });
  }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }), page = await ctx.newPage(); await organizer(page);
  // 1. standings NOT authorized: no team, no score, anywhere on the screen or in the payload
  await page.goto("/admin/projector"); await expect(page.getByRole("heading", { name: "Find the insider." })).toBeVisible({ timeout: 20_000 });
  const hidden = await (await page.request.get("/api/admin/projector")).json(); expect(hidden.standings).toBeNull(); await expect(page.locator("body")).not.toContainText(/Projector Team|Live leaderboard/); await page.screenshot({ path: `${SHOTS}/projector-0-unpublished.png` });
  // 2. organizer authorizes standings (audited switch): the Top 12 appears
  await prisma.auditLog.create({ data: { actor: "organizer", action: "broadcast-standings-on", detail: JSON.stringify({ reason: "test" }) } }); await page.waitForTimeout(3500);
  await page.reload(); const board = page.getByRole("region", { name: /Live leaderboard/ }); await expect(board).toBeVisible({ timeout: 20_000 });
  await expect(board.locator("li.bc-lb-row")).toHaveCount(12); await expect(board).toContainText("LIVE / PROVISIONAL — ROUND 1"); await expect(board).toContainText("+6 more teams"); // 18 teams (14 + 4 fixtures), 12 listed, 6 more
  const names = await board.locator("li.bc-lb-row b").allInnerTexts(); expect(names[0]).toBe("Projector Team 01"); expect(names.every(n => /Projector Team/.test(n))).toBe(true);
  const ranks = await board.locator(".bc-rank").allInnerTexts(); expect(ranks.slice(0, 4)).toEqual(["1", "2", "3", "4"]); expect(ranks.some(r => r.startsWith("="))).toBe(true); // the tie shares a rank, shown with "="
  const geo = await page.evaluate(() => { const r = (s: string) => document.querySelector(s)!.getBoundingClientRect(); const t = r(".bc-clock b"), list = r(".bc-lb-list"), top = r(".bc-top"); return { timerBottom: t.bottom, timerH: t.height, listTop: list.top, listH: list.height, topBottom: top.bottom, scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight, lastBottom: [...document.querySelectorAll(".bc-lb-row")].at(-1)!.getBoundingClientRect().bottom, timerFont: parseFloat(getComputedStyle(document.querySelector(".bc-clock b")!).fontSize), nameFont: parseFloat(getComputedStyle(document.querySelector(".bc-lb-row b")!).fontSize) }; });
  const wrapped = await page.locator(".bc-rank").evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).fontSize) * 1.6).length); expect(wrapped).toBe(0); // no rank digit wraps
  expect(geo.timerBottom).toBeLessThanOrEqual(geo.topBottom + 1); expect(geo.topBottom).toBeLessThanOrEqual(geo.listTop); expect(geo.listH).toBeGreaterThan(geo.timerH * 5); // timer sits in the top band, the board is the dominant region
  expect(geo.scrollH).toBeLessThanOrEqual(geo.innerH + 1); expect(geo.lastBottom).toBeLessThanOrEqual(geo.innerH); expect(geo.timerFont).toBeLessThan(80); expect(geo.nameFont).toBeGreaterThanOrEqual(30);
  await expect(page.getByRole("timer")).toBeVisible(); await page.waitForTimeout(1800); await page.screenshot({ path: `${SHOTS}/projector-1-1920.png` }); // scene fade and row stagger finished
  await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(1800);
  const small = await page.evaluate(() => ({ scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, lastBottom: [...document.querySelectorAll(".bc-lb-row")].at(-1)!.getBoundingClientRect().bottom }));
  expect(small.scrollH, JSON.stringify(small)).toBeLessThanOrEqual(small.innerH + 1); expect(small.scrollW).toBeLessThanOrEqual(small.innerW); expect(small.lastBottom).toBeLessThanOrEqual(small.innerH); await page.screenshot({ path: `${SHOTS}/projector-2-1366.png` });
  await page.setViewportSize({ width: 1920, height: 1080 });
  // 3. a lost connection is announced, and the board is not silently trusted
  await page.route("**/api/admin/projector", route => route.abort()); await expect(page.locator(".bc-warn")).toContainText(/Connection interrupted|reconnecting/i, { timeout: 12_000 }); await page.unroute("**/api/admin/projector");
  // 4. after qualification: only the ten confirmed finalists (never padded to twelve) when the organizer shows them
  await prisma.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() - 60_000), endedAt: new Date() } });
  await page.goto("/admin"); await page.getByLabel("Review reason").fill("targeted projector check"); await page.getByLabel(/I reviewed incomplete investigations/).check(); // the real organizer flow (no seeded record)
  await page.getByRole("button", { name: "Confirm Top 10 and Advance to Round 2" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Confirm and advance" }).click();
  await expect(page.getByText(/FINAL \/ ORGANIZER CONFIRMED/).first()).toBeVisible({ timeout: 30_000 });
  await prisma.auditLog.create({ data: { actor: "organizer", action: "broadcast-standings-off", detail: JSON.stringify({ reason: "test" }) } });
  await prisma.auditLog.create({ data: { actor: "organizer", action: "broadcast-finalists-on", detail: JSON.stringify({ reason: "test" }) } }); await page.waitForTimeout(3500);
  await page.goto("/admin/projector"); const fin = page.getByRole("region", { name: /Finalists/ }); await expect(fin).toBeVisible({ timeout: 20_000 });
  await expect(fin.locator("li.bc-lb-row")).toHaveCount(10); await expect(fin).toContainText("ROUND 2 FINALISTS"); await expect(fin).not.toContainText(/\b\d{2,3}\s*\/\s*105/); await expect(page.locator("body")).not.toContainText("Projector Team 11"); // no scores, no standby teams, no filler rows
  await page.waitForTimeout(1800); await page.screenshot({ path: `${SHOTS}/projector-3-finalists.png` });
  await ctx.close();
});
