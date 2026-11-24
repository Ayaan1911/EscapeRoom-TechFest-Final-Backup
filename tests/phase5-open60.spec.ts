import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Round 2 (GHOST RETURNS, the only format), browser level.
// Run: GHOST_P5_SEED=enrolled node scripts/phase5-e2e.mjs tests/phase5-open60.spec.ts (disposable DB; P5-01..10 active finalists; SYNTHETIC test key).
// Screenshots of every terminal state go to D:/Ghost404-TestWorkspace/shots/ks (outside the repository).
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const T1 = "192.0.2.81", T2 = "203.0.113.88", W1 = "192.0.2.25", W2 = "198.51.100.12", W3 = "203.0.113.9", W4 = "192.0.2.92"; // synthetic fixture classification, not the case key
const NEVER = ["TEST FIXTURE", "\"malicious\"", "wrongMessages", "verdict", "rationale", "flaws"];
const SHOTS = "D:/Ghost404-TestWorkspace/shots/ks"; mkdirSync(SHOTS, { recursive: true });
const min = (m: number) => m * 60_000;

async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible(); }
const inject = (page: Page, n: number) => page.getByRole("navigation", { name: "Injects" }).getByRole("button").nth(n - 1).click();
const term = (page: Page) => page.getByRole("region", { name: "Kill Switch terminal" });
async function cmd(page: Page, c: string) { const box = page.getByLabel("Terminal command"); await expect(box).toBeEnabled(); await box.fill(c); await box.press("Enter"); await expect(box).toBeEnabled({ timeout: 10_000 }); }
const shot = (page: Page, name: string) => term(page).screenshot({ path: `${SHOTS}/${name}.png` });
test.beforeAll(async () => { await prisma.r2Session.deleteMany(); await prisma.r2Audit.deleteMany(); await prisma.r2BlockAttempt.deleteMany(); });
test.afterAll(async () => { await prisma.$disconnect(); });

test("the organizer starts Round 2 directly (no format choice); a waiting team flips to four open injects by itself", async ({ browser }) => {
  test.setTimeout(120_000);
  const tctx = await browser.newContext(), tp = await tctx.newPage(); await team(tp, "P5-01"); await tp.goto("/round2");
  await expect(tp.getByRole("heading", { name: "Stand by" })).toBeVisible();
  const octx = await browser.newContext(), op = await octx.newPage(); await organizer(op); await op.goto("/admin/round2");
  await expect(op.getByRole("radio")).toHaveCount(0); await expect(op.getByText(/40 minutes|40-minute/)).toHaveCount(0); // no format selector, no retired format
  await op.getByRole("button", { name: "Start Round 2" }).click(); await op.getByRole("button", { name: "Yes, start the 60-minute investigation" }).click();
  await expect(op.getByText("SUGGESTED NOW (ALL INJECTS OPEN)")).toBeVisible({ timeout: 15_000 });
  expect(await prisma.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ format: "open-60" });
  await expect(tp.getByRole("navigation", { name: "Injects" })).toBeVisible({ timeout: 20_000 });
  await expect(tp.getByRole("timer", { name: "Time remaining" })).toHaveText(/^(59|60):\d\d$/);
  await expect(op.getByRole("region", { name: "Kill Switch terminal review" })).toBeVisible();
  await octx.close(); await tctx.close();
});

test("all four injects are open together, free navigation, paper only except the Kill Switch terminal, no key material", async ({ page }) => {
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(30)) } });
  await team(page, "P5-02"); await page.goto("/round2");
  const html = await page.content(); for (const s of NEVER) expect(html).not.toContain(s);
  for (const n of [4, 1, 3, 2, 1]) await inject(page, n); // move freely in any order
  await expect(page.getByRole("heading", { name: "Alert at 2:14 AM", level: 1 })).toBeVisible(); await expect(page.locator(".ij-table tbody tr")).toHaveCount(13);
  await inject(page, 3); await expect(page.locator(".ij-claims li")).toHaveCount(8);
  await inject(page, 4); await page.getByRole("button", { name: /Public statement/ }).click(); await expect(page.locator(".ij-sentences li")).toHaveCount(6);
  for (const n of [1, 3, 4]) { await inject(page, n); await expect(page.locator(".ij input, .ij textarea, .ij select")).toHaveCount(0); }
  await inject(page, 2); await expect(page.locator(".ij input")).toHaveCount(1);
  await expect(page.locator(".ks-node")).toHaveCount(10); await expect(page.locator(".ks-conns tbody tr")).toHaveCount(10);
});

test("Kill Switch: inspect, tickets, help/clear, wrong and right blocks, duplicates, then early success lock (screenshots)", async ({ page }) => {
  test.setTimeout(120_000);
  await team(page, "P5-03"); await page.goto("/round2"); await inject(page, 2);
  await expect(term(page)).toContainText("NEXUS SOC TERMINAL v2.1"); await expect(term(page)).toContainText("KILL SWITCH ACCESS GRANTED"); await expect(term(page)).toContainText("You have 4 attempts. Choose carefully.");
  await shot(page, "1-initial");
  await page.getByRole("button", { name: /inspect connection 6$/ }).click();
  await expect(page.getByRole("region", { name: "Inspect connection 6" })).toContainText("One small packet every 60 seconds");
  await page.getByRole("button", { name: /IT-4518 · open in ticket log/ }).click(); await expect(page.locator("#ks-IT-4518")).toContainText("Created by service account svc-sync.");
  await expect(page.getByText("Standard laptop software needs no ticket: mail-sync.exe.")).toBeVisible();
  await page.getByRole("region", { name: "Inspect connection 6" }).screenshot({ path: `${SHOTS}/2-selected-connection.png` });
  await page.getByRole("region", { name: "IT ticket log" }).screenshot({ path: `${SHOTS}/3-ticket-log.png` });
  await page.getByRole("button", { name: /inspect connection 5$/ }).click(); await page.getByRole("button", { name: /Copy IP into the terminal/ }).click();
  await expect(page.getByLabel("Terminal command")).toHaveValue(`BLOCK ${T1}`); expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-03" } })).toBe(0); // copying never runs it
  await page.getByLabel("Terminal command").fill("");
  await cmd(page, "help"); await expect(term(page)).toContainText("clear the screen");
  await cmd(page, "BLOK 1.2.3.4"); await expect(term(page)).toContainText("Unknown command. Usage: BLOCK <ip address>");
  await cmd(page, "BLOCK 8.8.8.8"); await expect(term(page)).toContainText("Not a connection on this list.");
  await expect(term(page).getByRole("img", { name: "4 of 4 attempts left" })).toBeVisible();
  await cmd(page, `block ${W1}`); await expect(term(page)).toContainText(`[BLOCKED] ${W1}. TEST: fixture outage one.`); await shot(page, "4-wrong-block");
  await cmd(page, `block ${W1}`); await expect(term(page)).toContainText("Already blocked."); await expect(term(page).getByRole("img", { name: "3 of 4 attempts left" })).toBeVisible();
  await cmd(page, `BLOCK ${T1}`); await expect(term(page)).toContainText(`[OK] ${T1} BLOCKED. Suspicious traffic stopped. 1 of 2 threats contained.`); await shot(page, "5-correct-block");
  await expect(page.locator(".ks-node.is-caught")).toHaveCount(1); await expect(page.locator(".ks-node.is-cleared")).toHaveCount(1); // only the team's own attempts are marked
  await cmd(page, "clear"); await expect(term(page).locator(".ks-log li.is-ok")).toHaveCount(0); // screen only
  await page.reload(); await inject(page, 2); await expect(term(page).getByRole("img", { name: "2 of 4 attempts left" })).toBeVisible(); // the server kept everything
  await expect(term(page)).toContainText(`[OK] ${T1} BLOCKED.`);
  await cmd(page, `block ${T2}`); await expect(term(page)).toContainText("[OK] Both threats contained. Terminal locked."); await expect(term(page)).toContainText("THREATS CONTAINED");
  await shot(page, "8-both-contained");
  await cmd(page, `block ${W2}`); await expect(term(page)).toContainText("Terminal locked."); expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-03" } })).toBe(3);
});

test("Kill Switch: one attempt left turns red, exhaustion locks with the volunteer warning, across tabs and re-login (screenshots)", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext(), page = await ctx.newPage(); await team(page, "P5-04"); await page.goto("/round2"); await inject(page, 2);
  await cmd(page, `block ${W1}`); await cmd(page, `block ${W2}`);
  const second = await ctx.newPage(); await second.goto("/round2"); await inject(second, 2); // another tab shares the budget
  await expect(term(second).getByRole("img", { name: "2 of 4 attempts left" })).toBeVisible(); await cmd(second, `block ${W3}`);
  await page.reload(); await inject(page, 2); await expect(term(page).getByRole("img", { name: "1 of 4 attempts left" })).toBeVisible(); await expect(term(page).locator(".ks-att.is-bad")).toHaveCount(1);
  await shot(page, "6-one-attempt-left");
  await cmd(page, `block ${W4}`); await expect(term(page)).toContainText("[FAIL] Out of attempts. Terminal locked. See a volunteer."); await expect(term(page)).toContainText("CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!");
  await shot(page, "7-out-of-attempts");
  const direct = await page.request.post("/api/round2/terminal", { headers: { Origin: "http://127.0.0.1:3000" }, data: { command: `block ${T1}` } }); expect((await direct.json()).lines[0].text).toBe("Terminal locked.");
  expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-04" } })).toBe(4);
  await ctx.close();
  const again = await browser.newContext(), p2 = await again.newPage(); await team(p2, "P5-04"); await p2.goto("/round2"); await inject(p2, 2); await expect(term(p2)).toContainText("OUT OF ATTEMPTS"); await again.close();
});

test("pens down at 60:00 closes everything and locks the terminal; the retired format cannot be reached", async ({ page }) => {
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(60) - 2000) } });
  await team(page, "P5-05"); await page.goto("/round2"); await expect(page.getByRole("heading", { name: "PENS DOWN" })).toBeVisible();
  for (const s of ["ALR-0214", "SENTINEL-AI", "IT-4518"]) expect(await page.content()).not.toContain(s);
  expect((await (await page.request.post("/api/round2/terminal", { headers: { Origin: "http://127.0.0.1:3000" }, data: { command: `block ${T1}` } })).json()).lines[0].text).toMatch(/not running/);
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(9)), format: null } }); // a historical 40-minute row (this test database only)
  await page.goto("/round2"); await expect(page.getByRole("heading", { name: "Round 2 is closed" })).toBeVisible(); await expect(page.locator(".rp-head")).toHaveCount(0);
  for (const path of ["/round2/chapter/2", "/round2/3"]) expect((await page.request.get(path)).status()).toBe(404);
});

test("demo: one Round 2 launch, no format buttons, a disposable terminal that stores nothing; v2 printables render", async ({ page }) => {
  await organizer(page); await page.goto("/admin/demo");
  await expect(page.getByRole("link", { name: /Launch GHOST RETURNS — 60-minute investigation/ })).toBeVisible(); await expect(page.getByText(/40-minute/)).toHaveCount(0);
  const before = await prisma.r2BlockAttempt.count();
  await page.goto("/admin/demo/round2?unit=2"); await expect(page.getByText("DEMO · CASE v2")).toBeVisible(); await expect(page.locator(".ij-formats")).toHaveCount(0);
  await cmd(page, `block ${T1}`); await expect(term(page)).toContainText(`[OK] ${T1} BLOCKED.`); expect(await prisma.r2BlockAttempt.count()).toBe(before);
  await page.getByRole("button", { name: "Reset demo terminal" }).click(); await expect(term(page).getByRole("img", { name: "4 of 4 attempts left" })).toBeVisible();
  await page.goto("/admin/round2/print"); for (const t of ["Team answer sheet", "Kill Switch correct-IP slips", "Kill Switch terminal results", "Round 2 score sheet (60)"]) await expect(page.getByText(t).first()).toBeVisible();
  await page.goto("/admin/round2/print/answer-sheet"); await expect(page.getByText("A convincing legitimate connection that must NOT be blocked, and why")).toBeVisible();
  await page.goto("/admin/round2/print/terminal"); await expect(page.getByRole("table")).toContainText("P5-03");
});
