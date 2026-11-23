import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Round 2 case document v2 (60-minute open-inject format), browser level.
// Run: GHOST_P5_SEED=enrolled node scripts/phase5-e2e.mjs tests/phase5-open60.spec.ts (disposable DB; P5-01..10 active finalists; TEST key fixture).
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const TARGETS = ["192.0.2.81", "192.0.2.92"], CLEARED = "192.0.2.25"; // the TEST fixture's classification, not the case key
const NEVER = ["TEST FIXTURE", "\"malicious\"", "verdict", "rationale", "flaws", "NOT ENOUGH EVIDENCE\",\"reason"];
const min = (m: number) => m * 60_000;

async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible(); }
const inject = (page: Page, n: number) => page.getByRole("navigation", { name: "Injects" }).getByRole("button").nth(n - 1).click();
test.beforeAll(async () => { await prisma.r2Session.deleteMany(); await prisma.r2Audit.deleteMany(); await prisma.r2BlockAttempt.deleteMany(); });
test.afterAll(async () => { await prisma.$disconnect(); });

test("organizer chooses the 60-minute format; a waiting team flips to the four open injects by itself", async ({ browser }) => {
  test.setTimeout(120_000);
  const tctx = await browser.newContext(), tp = await tctx.newPage(); await team(tp, "P5-01"); await tp.goto("/round2");
  await expect(tp.getByRole("heading", { name: "Stand by" })).toBeVisible();
  const octx = await browser.newContext(), op = await octx.newPage(); await organizer(op); await op.goto("/admin/round2");
  await op.getByRole("radio", { name: /60 minutes · four open injects/ }).check();
  await op.getByRole("button", { name: "Start investigation" }).click(); await op.getByRole("button", { name: /Yes, start the 60-minute open-inject format/ }).click();
  await expect(op.getByText(/Running format: 60 minutes/)).toBeVisible({ timeout: 15_000 });
  await expect(op.getByText("SUGGESTED NOW (ALL INJECTS OPEN)")).toBeVisible();
  expect(await prisma.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ format: "open-60" });
  await expect(tp.getByRole("navigation", { name: "Injects" })).toBeVisible({ timeout: 20_000 });
  await expect(tp.getByRole("timer", { name: "Time remaining" })).toHaveText(/^(59|60):\d\d$/);
  await octx.close(); await tctx.close();
});

test("all four injects are open together, read-only, with the exact evidence and no answer data", async ({ page }) => {
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(30)) } });
  await team(page, "P5-02"); await page.goto("/round2");
  const html = await page.content(); for (const s of NEVER) expect(html).not.toContain(s);
  await inject(page, 1); await expect(page.getByRole("heading", { name: "Alert at 2:14 AM", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Processes" })).toHaveAttribute("aria-selected", "true"); await expect(page.locator(".ij-table tbody tr")).toHaveCount(13);
  await page.getByRole("tab", { name: "Network activity" }).click(); await expect(page.getByText("203.0.113.250 (Server X)").first()).toBeVisible();
  await page.getByRole("tab", { name: "Chat transcript" }).click(); await expect(page.getByText(/around 10 PM/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Response options" }).locator(".ij-opts li")).toHaveCount(5);
  await inject(page, 3); await expect(page.locator(".ij-claims li")).toHaveCount(8);
  await page.getByRole("button", { name: /Claim 6/ }).click(); await expect(page.locator(".ij-focus")).toContainText("CEO's VPN login");
  await page.getByRole("button", { name: /^R-9/ }).click(); await expect(page.getByRole("article", { name: "Record R-9" })).toContainText("21:14 UTC"); await expect(page.getByText("Times in UTC")).toBeVisible();
  await page.getByRole("tab", { name: /Night timeline/ }).click(); await expect(page.locator(".ij-tl li")).toHaveCount(10);
  await inject(page, 4); await expect(page.locator(".ij-status div")).toHaveCount(6); await expect(page.locator(".ij-sentences li")).toHaveCount(6);
  await page.getByRole("button", { name: /Call 3/ }).click(); await expect(page.getByText("I need everything running by morning!").last()).toBeVisible();
  // paper only: the only text field anywhere in the four injects is the Inject 2 terminal
  for (const n of [1, 3, 4]) { await inject(page, n); await expect(page.locator(".ij input, .ij textarea, .ij select")).toHaveCount(0); }
  await inject(page, 2); await expect(page.locator(".ij input")).toHaveCount(1); await expect(page.getByLabel("Terminal command")).toBeVisible();
});

test("terminal: copy an IP without running it, four attempts across tabs and reloads, the exact messages, then locked", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext(), page = await ctx.newPage(); await team(page, "P5-03"); await page.goto("/round2"); await inject(page, 2);
  const box = page.getByLabel("Terminal command"), out = page.getByLabel("Terminal output"), run = async (c: string) => { await box.fill(c); await box.press("Enter"); };
  await expect(box).toBeEnabled();
  await page.getByRole("button", { name: "Inspect connection 9" }).click(); await page.getByRole("button", { name: /Copy IP into the terminal/ }).click();
  await expect(box).toHaveValue(`BLOCK ${TARGETS[0]}`); expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-03" } })).toBe(0); // copying never runs it
  await run("rm -rf /"); await expect(out).toContainText("Unknown command. Usage: BLOCK <IP>");
  await run(`BLOCK ${TARGETS[0]}`); await expect(out).toContainText("CAUGHT and BLOCKED!!"); await expect(page.getByText("3 / 4 attempts left")).toBeVisible();
  const second = await ctx.newPage(); await second.goto("/round2"); await inject(second, 2); // another tab of the same team shares the budget
  await expect(second.getByText("3 / 4 attempts left")).toBeVisible();
  await second.getByLabel("Terminal command").fill(`block ${CLEARED}`); await second.getByLabel("Terminal command").press("Enter");
  await expect(second.getByLabel("Terminal output")).toContainText("WHY THE HECK DID YOU BLOCKED ME ??? Connecting CEO");
  await page.reload(); await inject(page, 2); await expect(page.getByText("2 / 4 attempts left")).toBeVisible();
  await run(`block ${CLEARED}`); await expect(out).toContainText("ALREADY ATTEMPTED");
  await run(`block 192.0.2.53`); await expect(out).toContainText("CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!");
  await expect(box).toBeDisabled(); expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-03" } })).toBe(4);
  const direct = await page.request.post("/api/round2/terminal", { headers: { Origin: "http://127.0.0.1:3000" }, data: { command: `block ${TARGETS[1]}` } }); expect(direct.status()).toBe(409);
  await ctx.close();
});

test("pens down at 60:00 locks every inject and the terminal; the 40-minute format is untouched", async ({ page }) => {
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(60) - 2000) } });
  await team(page, "P5-04"); await page.goto("/round2"); await expect(page.getByRole("heading", { name: "PENS DOWN" })).toBeVisible();
  for (const s of ["ALR-0214", "SENTINEL-AI", "Turn those machines off"]) expect(await page.content()).not.toContain(s);
  expect((await page.request.post("/api/round2/terminal", { headers: { Origin: "http://127.0.0.1:3000" }, data: { command: `block ${TARGETS[1]}` } })).status()).toBe(409);
  await prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(9)), format: "paper-40" } });
  await page.goto("/round2"); await expect(page.locator(".rp-head h1")).toHaveText("Kill Switch"); await expect(page.locator(".ij-rail")).toHaveCount(0);
});

test("demo: both formats are previewable by the organizer; the demo terminal stores nothing and resets", async ({ page }) => {
  await organizer(page); const before = await prisma.r2BlockAttempt.count();
  await page.goto("/admin/demo/round2?format=open-60&unit=2"); await expect(page.getByText("DEMO · CASE v2")).toBeVisible();
  await page.getByLabel("Terminal command").fill(`block ${TARGETS[1]}`); await page.getByLabel("Terminal command").press("Enter"); await expect(page.getByLabel("Terminal output")).toContainText("CAUGHT and BLOCKED!!");
  expect(await prisma.r2BlockAttempt.count()).toBe(before);
  await page.getByRole("button", { name: "Reset demo terminal" }).click(); await expect(page.getByText("4 / 4 attempts left")).toBeVisible();
  await page.getByRole("link", { name: /40-minute sequential/ }).click(); await expect(page.locator(".rp-head h1")).toHaveText("Alert at 2:14 AM");
  await page.goto("/admin/round2/print/v2-answer-sheet"); await expect(page.getByText("NOT ENOUGH EVIDENCE").first()).toBeVisible(); await expect(page.getByText("IP addresses you blocked")).toBeVisible();
});
