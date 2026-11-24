import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Event control center (organizer, Round 2 marking, leaderboard, projector), browser level.
// Run: GHOST_P5_SEED=enrolled node scripts/phase5-e2e.mjs tests/phase5-event-control.spec.ts (disposable DB; P5-01..10 active finalists; SYNTHETIC test key).
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const SHOTS = "D:/Ghost404-TestWorkspace/shots/p3-e2e"; mkdirSync(SHOTS, { recursive: true });
const reset = async () => { await prisma.r2PaperMark.deleteMany(); await prisma.r2BlockAttempt.deleteMany(); await prisma.r2Session.deleteMany(); };
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? process.env.GHOST_E2E_TEAM_CODE!); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); }
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }

test.beforeAll(reset);
test.afterAll(async () => { await reset(); await prisma.$disconnect(); });

test("command center: pipeline, team search and details, no access codes, nothing starts by itself", async ({ page }) => {
  await organizer(page); await page.setViewportSize({ width: 1366, height: 768 });
  const before = await prisma.gameSession.findUnique({ where: { id: 1 } });
  await expect(page.getByRole("list", { name: "Event status" }).locator("li")).toHaveCount(7);
  const table = page.getByRole("table", { name: "Round 1 qualification leaderboard" }), rows = await table.locator("tbody tr").count();
  expect(rows).toBeGreaterThan(5);
  await page.getByLabel("Search teams").fill("P5-03"); await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Details for P5-03" }).click();
  await expect(page.getByRole("complementary", { name: "Team P5-03 details" })).toContainText("Chapter 2 + 3 raw");
  await page.getByLabel("Search teams").fill(""); await page.getByLabel("Group").selectOption("r2"); await expect.poll(() => table.locator("tbody tr").count()).toBeGreaterThanOrEqual(10); expect(await table.locator("tbody tr").count()).toBeLessThan(rows);
  expect(await page.locator("body").innerText()).not.toMatch(/codeHash|access code:|tokenHash/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/command-center.png`, fullPage: true });
  expect(await prisma.gameSession.findUnique({ where: { id: 1 } })).toEqual(before); // viewing changes nothing
  expect(await prisma.r2Session.count()).toBe(0);
});

test("jury marking: validation, terminal score read-only, pending is not zero, publish gate, locked after publication", async ({ page, browser }) => {
  await organizer(page); await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/admin/round2"); await expect(page.getByRole("button", { name: "Start Round 2" })).toBeVisible();
  await page.getByRole("button", { name: "Start Round 2" }).click(); await page.getByRole("button", { name: "Yes, start the 60-minute investigation" }).click();
  await expect(page.getByText("SUGGESTED NOW (ALL INJECTS OPEN)")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("timer", { name: "Round 2 time remaining" })).toHaveText(/^(59|60):\d\d$/);
  const sheet = page.getByRole("table", { name: "Round 2 marking sheet" });
  await expect(sheet.locator("tbody tr")).toHaveCount(10);
  await expect(sheet.getByLabel("P5-01 Inject 2 mark")).toHaveCount(0); // no field for the terminal score
  await page.getByLabel(/^Marking as/).fill("Jury QA");
  await sheet.getByLabel("P5-01 Inject 1 mark").fill("16"); await expect(page.getByRole("button", { name: "Save marks for P5-01" })).toBeDisabled();
  await sheet.getByLabel("P5-01 Inject 1 mark").fill("12"); await sheet.getByLabel("P5-01 Inject 3 mark").fill("9"); await sheet.getByLabel("P5-01 Inject 4 mark").fill("0");
  await page.getByRole("button", { name: "Save marks for P5-01" }).click(); await expect(page.getByText("Saved marks for P5-01.")).toBeVisible();
  const row1 = sheet.locator("tr", { has: page.getByText("P5-01", { exact: true }) });
  await expect(row1).toContainText("Pending: Kill Switch (round running)"); // terminal score is not final while the round runs
  expect(await prisma.r2PaperMark.count({ where: { teamId: "P5-01" } })).toBe(3);
  await expect(page.getByRole("button", { name: "Publish results" })).toBeDisabled();
  // pens down (deterministic test clock), then the rest of the sheet
  await prisma.r2Session.update({ where: { id: 1 }, data: { endedAt: new Date(Date.now() - 1000) } }); // marks are keyed to the session start, so the start never moves
  await page.reload(); await expect(page.getByRole("heading", { name: "INVESTIGATION COMPLETE — PENS DOWN" })).toBeVisible({ timeout: 15_000 });
  await expect(row1.locator("td").nth(5)).toHaveText(/^\d+$/); // complete: a total now exists
  const p2 = sheet.locator("tr", { has: page.getByText("P5-02", { exact: true }) }); await expect(p2).toContainText("Pending: Inject 1, Inject 3, Inject 4");
  for (let i = 2; i <= 10; i++) { const id = `P5-${String(i).padStart(2, "0")}`; for (const n of [1, 3, 4]) await sheet.getByLabel(`${id} Inject ${n} mark`).fill(String((i + n) % 16)); await page.getByRole("button", { name: `Save marks for ${id}` }).click(); await expect(page.getByText(`Saved marks for ${id}.`)).toBeVisible(); }
  await expect(page.getByText("10 of 10 teams complete")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/marking-complete.png`, fullPage: true });
  // participants cannot read or write marks
  const t = await browser.newContext(), tp = await t.newPage(); await team(tp, "P5-02");
  expect((await tp.request.get("/api/round2/admin?view=marking")).status()).toBe(401);
  expect((await tp.request.post("/api/round2/admin", { data: { action: "mark", teamId: "P5-02", inject: 1, score: 15, marker: "Self" }, headers: { origin: "http://127.0.0.1:3000" } })).status()).toBe(401);
  await t.close();
  // results stay off the projector until publication
  await page.goto("/admin/projector"); await expect(page.getByRole("heading", { name: "PENS DOWN" })).toBeVisible({ timeout: 15_000 });
  await page.goto("/admin/round2"); await page.locator("#marking").getByLabel("Reason (required)").fill("Head judge checked every sheet");
  await page.getByRole("button", { name: "Publish results" }).click(); await page.getByRole("button", { name: "Yes, publish and lock marks" }).click();
  await expect(page.getByText("Published · locked")).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByLabel("P5-01 Inject 1 mark")).toBeDisabled();
  expect(await prisma.r2Audit.count({ where: { action: "publish-results" } })).toBe(1);
  await page.goto("/admin/projector"); await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({ timeout: 15_000 });
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.screenshot({ path: `${SHOTS}/projector-results.png` });
  await page.goto("/admin/leaderboard?view=r2"); await expect(page.getByRole("table", { name: "Round 2 results" }).locator("tbody tr")).toHaveCount(10);
  await page.setViewportSize({ width: 1366, height: 768 }); await page.screenshot({ path: `${SHOTS}/leaderboard-r2.png`, fullPage: true });
});
