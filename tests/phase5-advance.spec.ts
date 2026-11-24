import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Round 1 closed -> Review Top 10 -> tie at 10th place -> organizer chooses -> advance -> waiting state -> organizer starts -> Enter Round 2.
// Run (NO seed flag: Round 1 is finished, 14 teams, nothing confirmed): node scripts/phase5-e2e.mjs tests/phase5-advance.spec.ts
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/adv"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); }
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }

test.afterAll(async () => { await prisma.$disconnect(); });

test("14 teams finish Round 1; a tie at 10th place needs the organizer; exactly the approved 10 advance and Round 2 does not start", async ({ page }) => {
  test.setTimeout(180_000); await page.setViewportSize({ width: 1366, height: 768 });
  // Fixture: make P5-11 tie P5-10 (46 points each) so the 10th place is split. P5-10 and P5-11 are the tied group for ONE open place.
  const p11 = await prisma.team.findUniqueOrThrow({ where: { id: "P5-11" } }), prog = JSON.parse(p11.progress); prog.chapters[2].score = 6;
  await prisma.team.update({ where: { id: "P5-11" }, data: { progress: JSON.stringify(prog) } });
  const before = JSON.stringify(await prisma.team.findMany({ select: { id: true, progress: true }, orderBy: { id: "asc" } }));

  await organizer(page);
  await expect(page.getByRole("link", { name: "Review Top 10 Teams" })).toBeVisible(); // the prominent next action once Round 1 is closed
  await page.getByRole("link", { name: "Review Top 10 Teams" }).click();
  const board = page.locator("#qualification");
  await expect(board.getByRole("heading", { name: "Review Top 10 Teams" })).toBeVisible();
  await expect(board.getByRole("alert")).toContainText("TIE AT 10TH PLACE"); await expect(board.getByRole("alert")).toContainText("46 points");
  const advance = page.getByRole("button", { name: "Confirm Top 10 and Advance to Round 2", exact: true }); await expect(advance).toBeDisabled(); // cannot proceed without the organizer's decision
  await expect(board.getByRole("group", { name: /Tie at 10th place: choose 1 of 2/ })).toBeVisible();
  await board.getByLabel("Advance Finalist 11").check();
  await expect(board.getByLabel("Advance Finalist 10")).toBeDisabled(); // exactly the open places
  await expect(board.getByText("1 of 1 chosen")).toBeVisible(); await expect(advance).toBeEnabled();
  await board.getByLabel("Review reason", { exact: true }).fill("E2E: head judge chose Finalist 11 after re-reading both reports");
  await board.getByLabel("I reviewed incomplete investigations, tie-break details and audited overrides.", { exact: true }).check();
  await page.screenshot({ path: `${SHOTS}/1-review-top10-tie.png`, fullPage: true });
  await advance.click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(10); // the dialog lists exactly the teams that will advance
  await expect(dialog).toContainText("Finalist 11"); await expect(dialog).not.toContainText("Finalist 10 ·"); await expect(dialog).toContainText("manual decision");
  await page.screenshot({ path: `${SHOTS}/2-confirm-dialog.png` });
  await dialog.getByRole("button", { name: "Confirm and advance" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Top 10 confirmed and advanced to Round 2/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#qualification").getByRole("heading", { name: "Advanced to Round 2" })).toBeVisible();
  await page.locator("#qualification").scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/3-advanced.png`, fullPage: true });

  // Persisted exactly as approved; nothing else changed; Round 2 not started.
  const active = (await prisma.r2Finalist.findMany({ where: { status: "active" } })).map(f => f.teamId).sort();
  expect(active).toEqual(["P5-01", "P5-02", "P5-03", "P5-04", "P5-05", "P5-06", "P5-07", "P5-08", "P5-09", "P5-11"]);
  expect((await prisma.r2Finalist.findMany({ where: { status: "standby" } })).map(f => f.teamId).sort()).toEqual(["P5-10", "P5-12"]);
  expect(await prisma.r2Session.count()).toBe(0);
  expect(JSON.stringify(await prisma.team.findMany({ select: { id: true, progress: true }, orderBy: { id: "asc" } }))).toBe(before);
  const detail = JSON.parse((await prisma.auditLog.findFirstOrThrow({ where: { action: "qualification-confirmed" } })).detail); expect(detail.tieDecision).toMatchObject({ manual: true, chosen: ["P5-11"] });
  expect(await prisma.auditLog.count({ where: { action: "qualification-confirmed" } })).toBe(1);
  // Pipeline and Round 2 readiness show the real numbers.
  await page.goto("/admin"); await expect(page.getByRole("list", { name: "Event status" }).locator("li").nth(3)).toContainText("10 finalists enrolled");
  await page.goto("/admin/round2"); await expect(page.getByText("10 qualified teams enrolled")).toBeVisible(); await expect(page.getByRole("button", { name: "Enroll finalists" })).toHaveCount(0); // already enrolled by the advance
  await expect(page.getByText("Not started", { exact: true }).first()).toBeVisible();
});

test("participants: qualified teams wait, reserve and non-qualified teams get no Round 2, and the organizer's own start opens it for the qualified only", async ({ browser, page }) => {
  test.setTimeout(240_000);
  const run = async <T,>(id: string, fn: (p: Page) => Promise<T>) => { const c = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p = await c.newPage(); try { await team(p, id); return await fn(p); } finally { await c.close(); } };
  await run("P5-11", async p => { // qualified by the organizer's tie decision
    await expect(p.getByRole("status").filter({ hasText: "Qualified for Round 2 — Waiting for Organizer" })).toBeVisible(); await expect(p.getByRole("link", { name: "Enter Round 2" })).toHaveCount(0);
    await p.screenshot({ path: `${SHOTS}/4-qualified-waiting.png` });
    await p.goto("/round2"); await expect(p.getByRole("heading", { name: "Stand by" })).toBeVisible();
    expect((await p.request.get("/api/round2/status")).status()).toBe(200); expect(JSON.stringify(await (await p.request.get("/api/round2/status")).json())).not.toMatch(/injects":\[/);
  });
  await run("P5-10", async p => { // tied but not chosen: reserve
    await expect(p.getByRole("heading", { name: "Reserve team for Round 2" })).toBeVisible(); await expect(p.getByRole("link", { name: "Enter Round 2" })).toHaveCount(0);
    await p.goto("/round2"); await expect(p.getByRole("heading", { name: /Round 2 is for confirmed finalists|standby/i })).toBeVisible(); expect((await p.request.get("/api/round2/status")).status()).toBe(403);
  });
  await run("P5-14", async p => { // not qualified
    await expect(p.getByRole("heading", { name: "Qualification review complete" })).toBeVisible(); await expect(p.getByText(/Qualified for Round 2/)).toHaveCount(0);
    for (const url of ["/api/round2/status", "/api/round2/terminal"]) expect((await p.request.get(url)).status(), url).toBe(403);
    await p.goto("/round2"); await expect(p.getByRole("heading", { name: "Round 2 is for confirmed finalists" })).toBeVisible(); await expect(p.getByRole("navigation", { name: "Injects" })).toHaveCount(0);
    await p.screenshot({ path: `${SHOTS}/5-not-qualified-restricted.png` });
  });
  // Organizer starts the shared 60-minute round (its own action; confirming qualification did not).
  await organizer(page); await page.goto("/admin/round2");
  await page.getByRole("button", { name: "Start Round 2" }).click(); await page.getByRole("button", { name: "Yes, start the 60-minute investigation" }).click();
  await expect(page.getByText("SUGGESTED NOW (ALL INJECTS OPEN)")).toBeVisible({ timeout: 15_000 }); await expect(page.getByRole("radio")).toHaveCount(0);
  await run("P5-11", async p => {
    await expect(p.getByRole("link", { name: "Enter Round 2" })).toBeVisible({ timeout: 20_000 }); // the dashboard polls; the button appears by itself
    await p.screenshot({ path: `${SHOTS}/6-enter-round2.png` });
    await p.getByRole("link", { name: "Enter Round 2" }).click(); await expect(p).toHaveURL(/\/round2$/); await expect(p.getByRole("navigation", { name: "Injects" }).getByRole("button")).toHaveCount(4);
  });
  await run("P5-14", async p => { expect((await p.request.get("/api/round2/status")).status()).toBe(403); await expect(p.getByRole("link", { name: "Enter Round 2" })).toHaveCount(0); await p.goto("/round2"); await expect(p.getByRole("navigation", { name: "Injects" })).toHaveCount(0); });
});
