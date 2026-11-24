import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Evidence Wall: a player reconstructs all three folders, start to finish. Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts
// (disposable local database; Round 1 active; UI-A is a variant-A team).
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/wall"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
test.afterAll(async () => { await prisma.$disconnect(); });

async function organizerCodes(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/admin/insider-kit"); await page.getByRole("button", { name: "Prepare pair code sheets (all teams)" }).click();
  const sheets = page.getByRole("region", { name: "Pair code sheets" }); await expect(sheets).toBeVisible();
  const slips: Record<string, string> = {}, wall: Record<string, string[]> = {};
  for (const row of await sheets.locator("tr[data-team-id='UI-A']").all()) slips[(await row.getAttribute("data-pair"))!] = (await row.locator("code").innerText()).trim();
  for (const row of await sheets.locator("tr[data-wall-role]").all()) { const [variant, pair, , cardCode] = (await row.locator("td").allInnerTexts()).map(t => t.trim()); if (variant === "A") (wall[`${pair}:${await row.getAttribute("data-wall-role")}`] ??= []).push(cardCode); }
  return { slips, wall };
}
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function match(page: Page, priv: string, pub: string) {
  const button = page.getByRole("button", { name: "Match fragments" }); await expect(button).toBeEnabled({ timeout: 15_000 }); // the 3-second spacing between attempts is real
  await page.getByLabel("Private slip code").fill(priv); await page.getByLabel("Wall card code").fill(pub); await button.click();
}

test("a player reconstructs the three evidence folders from beginning to end", async ({ browser, page }) => {
  test.setTimeout(240_000);
  const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id: "UI-A" } })).progress); p.chapters[0].score = 15; p.chapters[0].unlockedAt = 1; p.chapters[1].score = 25; p.chapters[1].unlockedAt = 1; p.chapters[2].unlockedAt = 1;
  await prisma.team.update({ where: { id: "UI-A" }, data: { progress: JSON.stringify(p) } }); // chapter 3 reachable; no points awarded by the wall
  const { slips, wall } = await organizerCodes(page);
  expect(Object.keys(slips).sort()).toEqual(["A", "B", "C"]); expect(Object.keys(wall).sort()).toEqual(["A:decoy", "A:match", "B:decoy", "B:match", "C:decoy", "C:match"]);

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p1 = await ctx.newPage(), problems: string[] = [];
  p1.on("pageerror", e => problems.push(e.message)); p1.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await team(p1, "UI-A"); await p1.goto("/play/insider");
  const wallPanel = p1.getByRole("region", { name: /Reconstruct the evidence set/ });
  await expect(p1.getByRole("heading", { name: "Reconstruct the evidence set — 0/3" })).toBeVisible();
  await expect(p1.getByRole("list", { name: "Evidence folders" }).getByRole("listitem")).toHaveCount(3); await expect(p1.getByText("Sealed folder")).toHaveCount(3);
  await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toHaveCount(0); // nothing of the dossier before a match
  const html = await p1.content(); for (const c of [...Object.values(slips), ...Object.values(wall).flat()]) expect(html).not.toContain(c); // no code, and so no pairing, is in the page
  await p1.screenshot({ path: `${SHOTS}/1-before-matching.png` });

  await match(p1, slips.A, wall["B:match"][0]); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // right slip, another pair's card
  await match(p1, slips.A, wall["A:decoy"][0]); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // a lookalike decoy
  await expect(p1.getByRole("heading", { name: "Reconstruct the evidence set — 0/3" })).toBeVisible();

  await match(p1, slips.A, wall["A:match"][0]); await expect(p1.getByRole("status").filter({ hasText: "Match confirmed: Evidence A is open." })).toBeVisible();
  await expect(p1.getByRole("heading", { name: "Reconstruct the evidence set — 1/3" })).toBeVisible({ timeout: 15_000 });
  await expect(p1.getByText("Sealed folder")).toHaveCount(2); await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible({ timeout: 15_000 }); // staff profiles open with the first folder
  await expect(p1.getByText(/scored tasks open when all three/)).toBeVisible(); await expect(p1.getByRole("region", { name: "Scored tasks" })).toHaveCount(0);
  const wide = await p1.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, scrollX: window.scrollX, culprits: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 6).map(e => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)}`) }));
  expect(wide, JSON.stringify(wide)).toMatchObject({ over: expect.any(Number) }); expect(wide.over, JSON.stringify(wide)).toBeLessThanOrEqual(1); // no sideways scroll with one folder open
  await p1.screenshot({ path: `${SHOTS}/2-after-one-pair.png`, fullPage: true });
  await p1.reload(); await expect(p1.getByRole("heading", { name: "Reconstruct the evidence set — 1/3" })).toBeVisible(); // a refresh does not lose a solved pair
  await p1.waitForTimeout(3500); // the server spaces attempts 3 s apart; a reload resets only the browser's countdown

  await match(p1, slips.B, wall["B:match"][0]); await expect(p1.getByRole("heading", { name: "Reconstruct the evidence set — 2/3" })).toBeVisible({ timeout: 15_000 });
  await match(p1, slips.C, wall["C:match"][0]);
  await expect(p1.getByRole("heading", { name: "EVIDENCE SET RECONSTRUCTED — 3/3" })).toBeVisible({ timeout: 15_000 });
  await expect(p1.getByRole("region", { name: "Scored tasks" })).toBeVisible({ timeout: 15_000 }); await expect(p1.getByRole("button", { name: "Match fragments" })).toHaveCount(0);
  expect(await p1.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await p1.screenshot({ path: `${SHOTS}/3-all-three.png`, fullPage: true });

  // a different team cannot ride on UI-A's slips, and the wall changed no score
  const ctx2 = await browser.newContext(), p2 = await ctx2.newPage(); await team(p2, "UI-B");
  const stateB = await (await p2.request.get("/api/game")).json(); expect(stateB.insiderPairs).toEqual({ A: false, B: false, C: false }); /* issued by "all teams", nothing solved */ expect(JSON.stringify(stateB)).not.toContain(slips.A);
  expect((await p2.request.get("/api/game/insider")).status()).toBe(403); await ctx2.close();
  expect((await prisma.team.findUniqueOrThrow({ where: { id: "UI-A" } })).progress).toContain('"score":25'); expect((await (await p1.request.get("/api/game")).json()).score).toBe(40); // 15 + 25: the wall awarded nothing
  expect(problems).toEqual([]); await ctx.close(); void wallPanel;
});
