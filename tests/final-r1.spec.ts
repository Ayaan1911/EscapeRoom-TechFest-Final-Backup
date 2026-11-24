import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Password Show/Hide and fully digital Containment. Run: node scripts/redesign-e2e.mjs tests/final-r1.spec.ts (disposable local database; Round 1 active; UI-A..D fixtures).
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/final-r1.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/final"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
test.afterAll(async () => { await prisma.$disconnect(); });

async function checkToggle(page: Page, shot?: string) {
  const field = page.getByLabel("Access code"), eye = page.getByRole("button", { name: "Show password" });
  await expect(field).toHaveAttribute("type", "password"); await expect(eye).toHaveAttribute("aria-pressed", "false"); // hidden by default
  await field.fill("sample-access-0000"); if (shot) await page.screenshot({ path: `${SHOTS}/${shot}-hidden.png` });
  await eye.click(); await expect(field).toHaveAttribute("type", "text"); await expect(field).toHaveValue("sample-access-0000"); // revealed, value kept
  const hide = page.getByRole("button", { name: "Hide password" }); await expect(hide).toHaveAttribute("aria-pressed", "true"); await expect(page).not.toHaveURL(/error/); // the toggle did not submit the form
  if (shot) await page.screenshot({ path: `${SHOTS}/${shot}-revealed.png` });
  await hide.click(); await expect(field).toHaveAttribute("type", "password"); await expect(field).toHaveValue("sample-access-0000"); // hidden again, value kept
  await field.focus(); await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Show password" })).toBeFocused(); await page.keyboard.press("Enter"); await expect(field).toHaveAttribute("type", "text"); // keyboard operable
  await page.keyboard.press("Space"); await expect(field).toHaveAttribute("type", "password");
  const focusStyle = await page.getByRole("button", { name: "Show password" }).evaluate(el => getComputedStyle(el).outlineStyle); expect(focusStyle).not.toBe("none"); // visible focus indicator
  const box = await page.getByRole("button", { name: "Show password" }).boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(40); expect(box!.height).toBeGreaterThanOrEqual(36);
}

test("team login: password hidden by default, eye reveals and hides, value preserved, keyboard works, login still succeeds", async ({ page }) => {
  await page.goto("/login"); await page.getByLabel("Team ID").fill("UI-A"); await checkToggle(page, "login-team");
  await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Show password" }).click(); await expect(page.getByLabel("Access code")).toHaveValue(code()); // reveal, then submit with Enter
  await page.getByLabel("Access code").press("Enter"); await page.waitForURL(/\/play/); // a revealed field submits normally
  expect(await page.locator('input[type="password"], input[type="text"][name="code"]').count()).toBe(0); // no password field on the next page
});

test("organizer login: same behaviour, and a wrong code is still refused", async ({ page }) => {
  await page.goto("/organizer/login"); await checkToggle(page, "login-organizer");
  await page.getByLabel("Access code").fill("definitely-not-the-code"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Access denied" })).toBeVisible();
  await expect(page.getByLabel("Access code")).toHaveAttribute("type", "password"); // re-masked after the failed attempt
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Show password" }).click(); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 });
});

test("Containment is fully digital: the security-room evidence is on screen, no physical station or copy request, tasks still work", async ({ browser }) => {
  test.setTimeout(120_000);
  const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id: "UI-C" } })).progress); p.chapters[0].score = 15; p.chapters[0].unlockedAt = 1; p.chapters[1].score = 25; p.chapters[1].unlockedAt = 1; p.chapters[2].score = 25; p.chapters[2].unlockedAt = 1; p.chapters[3].unlockedAt = 1;
  await prisma.team.update({ where: { id: "UI-C" }, data: { progress: JSON.stringify(p) } });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await ctx.newPage(), problems: string[] = [], origins = new Set<string>();
  page.on("pageerror", e => problems.push(e.message)); page.on("request", r => origins.add(new URL(r.url()).origin)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await page.goto("/login"); await page.getByLabel("Access code").fill(code()); await page.getByLabel("Team ID").fill("UI-C"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/);
  await page.goto("/play/containment"); await expect(page.getByRole("heading", { name: "Containment", exact: true })).toBeVisible({ timeout: 20_000 });
  const snap = page.getByRole("article", { name: "Fictional snapshot CCTV-C-08", exact: true }); await expect(snap).toBeVisible(); // the team's own variant, open without any grant
  await expect(snap).toContainText("CUST-C-01"); await expect(snap).toContainText(/console|receipt/i); await expect(snap).toContainText("No actual camera image");
  for (const other of ["A", "B"]) await expect(page.getByRole("article", { name: `Fictional snapshot CCTV-${other}-08`, exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/evidence station|accessible copy|Check authorized CCTV copy|ask an organizer|security-room clue/i); await expect(page.getByRole("button", { name: /authorized CCTV copy/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const data = await (await page.request.get("/api/game/containment")).json(); expect(data.cctv.id).toBe("CCTV-C-08"); expect(data.evidence.cctvReference).toEqual({ id: "CCTV-C-08" }); expect(JSON.stringify(data)).not.toMatch(/eventOrder|recoveryOrder|containmentSolution/);
  await page.getByRole("button", { name: /Phase 5: Preserve/ }).click(); await expect(page.getByText(/include the security-room snapshot/)).toBeVisible(); // the snapshot is still part of the evidence task
  await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}/containment-digital-evidence.png`, fullPage: true });
  expect([...origins].every(o => o === "http://127.0.0.1:3000")).toBe(true); expect(problems).toEqual([]);
  // organizer side: no CCTV kit in navigation, the old route only says it is retired
  const actx = await browser.newContext(), admin = await actx.newPage(); await admin.goto("/organizer/login"); await admin.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); await expect(admin.getByRole("link", { name: /Containment CCTV kit/ })).toHaveCount(0);
  await admin.goto("/admin/containment-kit"); await expect(admin.getByRole("heading", { name: "Containment CCTV kit: retired" })).toBeVisible(); await expect(admin.locator(".containment-cctv")).toHaveCount(0);
  await actx.close(); await ctx.close();
});
