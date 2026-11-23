import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

// GHOST RETURNS paper edition, browser level. Run: GHOST_P5_SEED=enrolled node scripts/phase5-e2e.mjs tests/phase5-paper.spec.ts (disposable local DB; finalists P5-01..10 are enrolled, no Round 2 session exists).
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const MARK = { 1: "ALR-0214", 2: "wsvc_sync.exe", 3: "CONFIDENCE 99.9%", 4: "Disconnect the infected machines" } as const;
const TITLE = { 1: "Alert at 2:14 AM", 2: "Kill Switch", 3: "Audit the AI", 4: "The Three Calls" } as const;
const min = (m: number) => m * 60_000;
const startedAgo = (ms: number, ended = false) => prisma.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms), contentVersion: "paper-v1" }, update: { startsAt: new Date(Date.now() - ms), endedAt: ended ? new Date() : null, contentVersion: "paper-v1" } });
const axeSrc = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

async function team(page: Page, id = "P5-01") {
  await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/);
}
async function organizer(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
}
const heading = (page: Page) => page.locator(".rp-head h1");
/** Rendered DOM without <script> tags: a tab that was already open keeps the framework payload it was served (text the team had seen), but the page must not render it. */
const rendered = (page: Page) => page.evaluate(() => { const c = document.body.cloneNode(true) as HTMLElement; c.querySelectorAll("script").forEach(x => x.remove()); return c.innerHTML; });
async function onlyChapter(page: Page, n: 1 | 2 | 3 | 4) {
  await expect(heading(page)).toHaveText(TITLE[n]);
  const html = await page.content();
  for (const k of [1, 2, 3, 4] as const) { if (k === n) expect(html).toContain(MARK[k]); else expect(html, `chapter ${k} text must not be in the page during chapter ${n}`).not.toContain(MARK[k]); }
}
test.afterAll(async () => { await prisma.$disconnect(); });
test.beforeAll(async () => { await prisma.r2Session.deleteMany(); await prisma.r2Audit.deleteMany(); });

test("organizer starts the investigation from the control room; a waiting team flips to Chapter 1 by itself", async ({ browser }) => {
  test.setTimeout(120_000);
  const tctx = await browser.newContext(), tp = await tctx.newPage(); await team(tp); await tp.goto("/round2");
  await expect(tp.getByRole("heading", { name: "Stand by" })).toBeVisible();
  for (const k of [1, 2, 3, 4] as const) expect(await tp.content()).not.toContain(MARK[k]);
  const octx = await browser.newContext(), op = await octx.newPage(); await organizer(op); await op.goto("/admin/round2");
  await expect(op.getByRole("heading", { name: "Round 2 control room" })).toBeVisible(); await expect(op.getByText("Not started")).toBeVisible();
  await op.getByRole("button", { name: "Start investigation" }).click(); await op.getByRole("button", { name: /Yes, start the 40-minute/ }).click();
  await expect(op.getByRole("heading", { name: /1 · Alert at 2:14 AM/ })).toBeVisible({ timeout: 15_000 });
  await expect(op.getByRole("list", { name: undefined }).filter({ hasText: "Chapter 2 opens" })).toBeVisible();
  await expect(tp.locator(".rp-head h1")).toHaveText(TITLE[1], { timeout: 15_000 }); // no reload
  expect(await prisma.r2Audit.count({ where: { action: "start" } })).toBe(1);
  expect((await prisma.r2Session.findUniqueOrThrow({ where: { id: 1 } })).contentVersion).toBe("paper-v1");
  await tctx.close(); await octx.close();
});

test("every chapter is read-only: no form, no input, no submit; tabs and inspection work", async ({ page }) => {
  test.setTimeout(120_000);
  await startedAgo(min(1)); await team(page); await page.goto("/round2"); await onlyChapter(page, 1);
  // No way to type or send an answer: no form/textarea/select anywhere. The only inputs allowed are the Audit desk's record search and its local "checked" ticks (investigation aids that store and send nothing).
  const noInputs = async () => { await expect(page.locator("main form, main textarea, main select")).toHaveCount(0); expect(await page.locator("main input").count()).toBe(await page.locator("main .rp-search input[type=search], main .rp-check input[type=checkbox]").count()); await expect(page.getByRole("button", { name: /submit|send|block|save/i })).toHaveCount(0); };
  await noInputs();
  await page.getByRole("tab", { name: "Login history" }).click(); await expect(page.getByText("No events")).toBeVisible();
  await expect(page.getByText("Can I just restart it?")).toBeVisible(); await expect(page.getByText("Isolate the laptop from the network")).toBeVisible();
  await startedAgo(min(9)); await page.reload(); await onlyChapter(page, 2); await noInputs();
  await expect(page.getByRole("note")).toContainText("READ-ONLY"); await expect(page.locator(".rp-conns tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: /Inspect connection 2/ }).click(); await expect(page.getByRole("region", { name: "Connection 2" })).toBeVisible();
  await page.getByRole("button", { name: "Data sent" }).click(); await expect(page.locator(".rp-conns tbody tr").first()).toContainText("198.51.100.12"); // sorted by data sent: the 4.2 GB backup first
  await startedAgo(min(21)); await page.reload(); await onlyChapter(page, 3); await noInputs();
  await expect(page.locator(".rp-report li")).toHaveCount(5); await expect(page.locator(".rp-tl li")).toHaveCount(10); await expect(page.getByText("AI SUMMARY TOOL")).toBeVisible();
  await startedAgo(min(31)); await page.reload(); await onlyChapter(page, 4); await noInputs();
  await expect(page.locator(".rp-call")).toHaveCount(3); await expect(page.locator(".rp-statement li")).toHaveCount(6);
});

test("chapter windows: only the open chapter is in the HTML; 40:00 shows PENS DOWN; rail reflects locked/done", async ({ page }) => {
  test.setTimeout(180_000);
  await team(page);
  for (const [m, n] of [[0.5, 1], [7, 1], [9, 2], [19, 2], [21, 3], [29, 3], [31, 4], [39, 4]] as const) {
    await startedAgo(min(m)); await page.goto("/round2"); await onlyChapter(page, n);
    await expect(page.locator(".rp-rail .is-active")).toContainText(TITLE[n]); await expect(page.locator(".rp-rail .is-locked")).toHaveCount(4 - n); await expect(page.locator(".rp-rail .is-done")).toHaveCount(n - 1);
  }
  await startedAgo(min(40.5)); await page.goto("/round2");
  await expect(page.getByRole("heading", { name: "INVESTIGATION COMPLETE — PENS DOWN" })).toBeVisible();
  const html = await page.content(); for (const k of [1, 2, 3, 4] as const) expect(html).not.toContain(MARK[k]);
  await startedAgo(min(5), true); await page.goto("/round2"); await expect(page.getByRole("heading", { name: /PENS DOWN/ })).toBeVisible(); // organizer ended early
});

test("direct URL and API bypass attempts never reveal another chapter or any online path", async ({ page }) => {
  test.setTimeout(120_000);
  await startedAgo(min(1)); await team(page);
  for (const url of ["/round2?chapter=3", "/round2?unit=4", "/round2?chapter=4&now=9999999", "/round2#chapter-3"]) { await page.goto(url); await onlyChapter(page, 1); }
  for (const path of ["/round2/3", "/round2/chapter/4", "/round2/answers", "/round2/print"]) expect((await page.request.get(path)).status()).toBe(404);
  const api = await page.request.get("/api/round2/status?chapter=4&now=99999999999", { headers: { "x-time": "9999999999999" } });
  const body = await api.json(); expect(body.chapter.n).toBe(1); expect(JSON.stringify(body)).not.toContain(MARK[4]);
  for (const path of ["/api/round2/evidence", "/api/round2/results", "/api/round2/drafts"]) expect((await page.request.get(path)).status()).toBe(410);
  expect((await page.request.post("/api/round2/submit", { data: { taskId: "i1.assets", answer: {} } })).status()).toBe(410);
  for (const path of ["/api/round2/admin?view=timing", "/api/round2/admin?view=readiness", "/api/round2/admin?view=qualification", "/api/round2/admin?view=audit"]) expect((await page.request.get(path)).status()).toBe(401);
  for (const path of ["/api/round2/admin?view=solutions", "/api/round2/admin?view=scores", "/api/round2/admin?view=results"]) expect([400, 401]).toContain((await page.request.get(path)).status()); // legacy views no longer exist
  for (const path of ["/admin/round2", "/admin/round2/print", "/admin/round2/print/key", "/admin/round2/projector", "/admin/demo/round2?unit=3"]) { await page.goto(path); await page.waitForURL(/organizer\/login/); }
});

test("refresh, reconnection and a wrong device clock do not change the chapter", async ({ browser }) => {
  test.setTimeout(120_000);
  await startedAgo(min(21));
  const ctx = await browser.newContext(); await ctx.addInitScript(() => { const real = Date.now.bind(Date); Date.now = () => real() - 3 * 3_600_000; }); // device clock 3 hours behind
  const page = await ctx.newPage(); await team(page); await page.goto("/round2"); await onlyChapter(page, 3);
  const timer = page.getByRole("timer", { name: "Chapter time remaining" }); const left = await timer.innerText(); expect(Number(left.split(":")[0])).toBeLessThanOrEqual(9);
  await page.reload(); await onlyChapter(page, 3);
  await ctx.setOffline(true); await page.waitForTimeout(1500); await ctx.setOffline(false); await page.reload(); await onlyChapter(page, 3); // reconnect
  const ahead = await browser.newContext(); await ahead.addInitScript(() => { const real = Date.now.bind(Date); Date.now = () => real() + 3 * 3_600_000; }); // 3 hours ahead
  const p2 = await ahead.newPage(); await team(p2, "P5-02"); await p2.goto("/round2"); await onlyChapter(p2, 3);
  const fresh = await browser.newContext(), p3 = await fresh.newPage(); await team(p3, "P5-03"); await p3.goto("/round2"); await onlyChapter(p3, 3); // a different device, same state
  await ctx.close(); await ahead.close(); await fresh.close();
});

test("live transitions without reload: Chapter 1 vanishes at 8:00 and PENS DOWN replaces Chapter 4 at 40:00", async ({ page }) => {
  test.setTimeout(150_000);
  await team(page); await startedAgo(min(8) - 6_000); await page.goto("/round2"); await onlyChapter(page, 1);
  await expect(heading(page)).toHaveText(TITLE[2], { timeout: 25_000 }); expect(await rendered(page)).not.toContain(MARK[1]); expect(await rendered(page)).toContain(MARK[2]);
  await startedAgo(min(40) - 6_000); await page.goto("/round2"); await onlyChapter(page, 4);
  await expect(page.getByRole("heading", { name: "INVESTIGATION COMPLETE — PENS DOWN" })).toBeVisible({ timeout: 25_000 }); expect(await rendered(page)).not.toContain(MARK[4]);
});

test("organizer tools: control room status, projector countdown with taunt, printable materials; teams are refused", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext(), page = await ctx.newPage(); await organizer(page);
  await startedAgo(min(8) + 5_000);
  await page.goto("/admin/round2"); await expect(page.getByRole("heading", { name: /2 · Kill Switch/ })).toBeVisible(); await expect(page.getByText(/Ten connections/)).toBeVisible();
  await page.goto("/admin/round2/projector"); await expect(page.getByText("CHAPTER 2 OF 4 · KILL SWITCH")).toBeVisible(); await expect(page.getByRole("timer", { name: "Chapter time remaining" })).toBeVisible(); await expect(page.getByRole("status")).toContainText("Ten connections");
  await startedAgo(min(40.5)); await page.goto("/admin/round2/projector"); await expect(page.getByRole("heading", { name: /PENS DOWN/ })).toBeVisible();
  await page.goto("/admin/round2/print"); for (const t of ["Team answer sheet", "Organizer answer key", "Part A marking rubric", "Boardroom Verdict rubric", "Combined paper score sheet", "Organizer timing script"]) await expect(page.getByRole("link", { name: new RegExp(t) })).toBeVisible();
  await page.goto("/admin/round2/print/answer-sheet"); for (const t of ["Alert at 2:14 AM", "Kill Switch", "Audit the AI", "The Three Calls", "Team name"]) await expect(page.getByText(t).first()).toBeVisible();
  await page.goto("/admin/round2/print/key"); await expect(page.getByText("ORGANIZER ONLY — ANSWER KEY").first()).toBeVisible(); await expect(page.getByText("203.0.113.45").first()).toBeVisible(); await expect(page.getByText(/Isolate the laptop/).first()).toBeVisible();
  await page.goto("/admin/round2/print/rubric-a"); await expect(page.getByText("PART A TOTAL")).toBeVisible();
  await page.goto("/admin/round2/print/rubric-b"); await expect(page.getByText("Culprit identification")).toBeVisible();
  await page.goto("/admin/round2/print/score-sheet"); await expect(page.getByRole("columnheader", { name: "TOTAL (100)" })).toBeVisible();
  await page.goto("/admin/round2/print/script"); await expect(page.getByText("Pens down.").first()).toBeVisible();
  await page.goto("/admin/round2/print/not-a-doc"); await expect(page.locator(".pp")).toHaveCount(0); await expect(page.getByText("ORGANIZER ONLY")).toHaveCount(0); // unknown document renders nothing
  await ctx.close();
  const tctx = await browser.newContext(), tp = await tctx.newPage(); await team(tp);
  await tp.goto("/admin/round2/print/key"); await tp.waitForURL(/organizer\/login/); await expect(tp.getByText("ORGANIZER ONLY")).toHaveCount(0);
  await tctx.close();
});

test("organizer preview (Demo Mode): all four chapters at once, no timers, no API calls, nothing written", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext(), page = await ctx.newPage(); await organizer(page);
  const before = await prisma.r2Audit.count() + await prisma.r2Session.count() + await prisma.r2Submission.count() + await prisma.r2Draft.count();
  const api: string[] = []; page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(u.pathname); });
  await page.goto("/admin/demo/round2?unit=1"); await expect(heading(page)).toHaveText(TITLE[1]); await expect(page.getByText(/DEMO · NO TIMERS/)).toBeVisible(); await expect(page.getByRole("timer")).toHaveCount(0);
  for (const n of [2, 3, 4, 1] as const) { await page.getByRole("button", { name: new RegExp(`${n}\\s*${TITLE[n]}`) }).click(); await expect(heading(page)).toHaveText(TITLE[n]); }
  await page.waitForTimeout(5000); // longer than any poll interval
  expect(api, "demo must not call any API route").toEqual([]);
  expect(await prisma.r2Audit.count() + await prisma.r2Session.count() + await prisma.r2Submission.count() + await prisma.r2Draft.count()).toBe(before);
  await ctx.close();
});

test("desktop and mobile: no horizontal overflow and no accessibility violations (WCAG A/AA) on every chapter", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(), page = await ctx.newPage(); await organizer(page);
  const problems: string[] = [];
  for (const [w, h] of [[375, 800], [768, 1024], [1366, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const n of [1, 2, 3, 4]) {
      await page.goto(`/admin/demo/round2?unit=${n}`); await expect(heading(page)).toHaveText(TITLE[n as 1 | 2 | 3 | 4]);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (over > 1) problems.push(`overflow ${over}px at ${w}px chapter ${n}`);
      await page.evaluate(axeSrc);
      const v = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: unknown }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(x => `${x.id}(${x.impact}) ${String(x.nodes[0].target).slice(0, 80)}`));
      if (v.length) problems.push(`axe ${w}px chapter ${n}: ${v.join("; ")}`);
    }
  }
  expect(problems).toEqual([]);
  await ctx.close();
});
void (null as unknown as BrowserContext);
