import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Evidence Wall, SHARED PAIRS: six fragments for the whole event; teams of a group share that group's pair. Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts
// (disposable local database; Round 1 active; UI-A..D are fixture teams; no real roster or credential is created).
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/final"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
test.afterAll(async () => { await prisma.$disconnect(); });

type Group = { group: string; priv: string; pub: string; teams: string[] };
async function organizerKit(page: Page): Promise<Group[]> {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/admin/insider-kit");
  const summary = page.getByRole("region", { name: "Evidence Wall group summary" });
  await expect(summary).toContainText("Not prepared yet"); await expect(page.getByRole("group", { name: "Unique fragment definitions" })).toContainText("Total unique fragments"); await page.screenshot({ path: `${SHOTS}/kit-0-before.png`, fullPage: true });
  await page.locator('select[name="view"]').selectOption("map"); await page.getByRole("button", { name: "Prepare shared fragments and groups (all teams)" }).click();
  const map = page.getByRole("region", { name: "Organizer code map" }); await expect(map).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText(/Demonstration roster: 4 teams/); await expect(summary).toContainText("Unique private fragments"); await expect(summary).toContainText("Definitions vs physical copies");
  const groups: Group[] = [];
  for (const row of await map.locator("tr[data-group]").all()) { const cells = (await row.locator("td").allInnerTexts()).map(t => t.trim()); groups.push({ group: cells[0], priv: cells[1], pub: cells[2], teams: cells[3] === "-" ? [] : cells[3].split(",").map(t => t.trim()) }); }
  return groups;
}
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Access code").fill(code()); await page.getByLabel("Team ID").fill(id); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function match(page: Page, priv: string, pub: string) {
  const button = page.getByRole("button", { name: "Match fragments" }); await expect(button).toBeEnabled({ timeout: 15_000 }); // the 3-second spacing between attempts is real
  await page.getByLabel("Private fragment code").fill(priv); await page.getByLabel("Public fragment code").fill(pub); await button.click();
}

test("organizer prepares ONE shared pair per group; two teams of a group unlock with the same codes", async ({ browser, page }) => {
  test.setTimeout(240_000);
  for (const id of ["UI-A", "UI-B", "UI-C", "UI-D"]) { const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id } })).progress); p.chapters[0].score = 15; p.chapters[0].unlockedAt = 1; p.chapters[1].score = 25; p.chapters[1].unlockedAt = 1; p.chapters[2].unlockedAt = 1; await prisma.team.update({ where: { id }, data: { progress: JSON.stringify(p) } }); }
  const groups = await organizerKit(page);
  // exactly six unique fragments, three pairs; every team has exactly one group; no per-team codes
  expect(groups.map(g => g.group)).toEqual(["A", "B", "C"]); const six = groups.flatMap(g => [g.priv, g.pub]); expect(new Set(six).size).toBe(6);
  expect(groups.flatMap(g => g.teams).sort()).toEqual(["UI-A", "UI-B", "UI-C", "UI-D"]);
  const mates = groups.find(g => g.teams.length >= 2)!, solo = groups.find(g => g.teams.length === 1)!; expect(mates.teams).toHaveLength(2); // 4 teams over 3 groups: two share one pair
  expect(await prisma.insiderGroupCode.count()).toBe(3); expect(await prisma.insiderWallCard.count()).toBe(0);

  // the printable public cards: exactly three, with the shared public codes; private codes never appear there
  await page.goto("/admin/insider-kit"); await page.locator('select[name="view"]').selectOption("public"); await page.getByRole("button", { name: "Show", exact: true }).click();
  const cards = page.locator("article.sf-card"); await expect(cards).toHaveCount(3, { timeout: 20_000 });
  const printed = (await page.locator(".sf-sheet").allInnerTexts()).join(" "); for (const g of groups) { expect(printed).toContain(g.pub); expect(printed).not.toContain(g.priv); } expect(printed).toContain("PUBLIC EVIDENCE FRAGMENT"); expect(printed).toContain("OPERATION GHOST_404");
  await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/kit-1-three-public-cards.png`, fullPage: true });
  await page.locator('input[name="copies"]').fill("3"); await page.getByRole("button", { name: "Show", exact: true }).click(); await expect(cards).toHaveCount(9); // extra copies are the SAME fragments
  expect(new Set(await cards.locator("code").allInnerTexts()).size).toBe(3);
  await page.locator('input[name="copies"]').fill("1"); await page.locator('select[name="view"]').selectOption("private"); await page.getByRole("button", { name: "Show", exact: true }).click(); await expect(cards).toHaveCount(3);
  const privText = (await page.locator(".sf-sheet").allInnerTexts()).join(" "); for (const g of groups) { expect(privText).toContain(g.priv); expect(privText).not.toContain(g.pub); }
  await page.locator('select[name="view"]').selectOption("public"); await page.getByRole("button", { name: "Prepare shared fragments and groups (all teams)" }).click(); // re-running changes nothing
  expect(await prisma.insiderGroupCode.findMany({ orderBy: { group: "asc" } }).then(r => r.map(x => x.publicCode))).toEqual(groups.map(g => g.pub)); expect(await prisma.insiderGroupMember.count()).toBe(4);

  const [first, second] = mates.teams, other = solo.teams[0], wrong = groups.find(g => g.group !== mates.group)!;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p1 = await ctx.newPage(), problems: string[] = [];
  p1.on("pageerror", e => problems.push(e.message)); p1.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await team(p1, first); await p1.goto("/play/insider");
  await expect(p1.getByRole("heading", { name: `Match your Group ${mates.group} fragment` })).toBeVisible(); await expect(p1.getByText("Sealed folder")).toHaveCount(0); await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toHaveCount(0);
  const html = await p1.content(); for (const c of six) expect(html).not.toContain(c); // no code is in the participant page before it is earned
  await p1.screenshot({ path: `${SHOTS}/wall-1-pairing-screen.png` });
  await match(p1, mates.priv, mates.group); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // the letter alone is not an answer
  await match(p1, wrong.priv, wrong.pub); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // another group's pair
  await match(p1, mates.priv, wrong.pub); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // half of each
  await match(p1, mates.priv, mates.pub);
  await expect(p1.getByRole("heading", { name: `GROUP ${mates.group} MATCHED — DOSSIER OPEN` })).toBeVisible({ timeout: 15_000 }); await expect(p1.getByRole("status").filter({ hasText: "Match confirmed" })).toBeVisible();
  await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible({ timeout: 15_000 }); await expect(p1.getByRole("region", { name: "Scored tasks" })).toBeVisible({ timeout: 15_000 }); await expect(p1.getByRole("button", { name: "Match fragments" })).toHaveCount(0); // no other pair is asked for
  expect(await p1.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1); await p1.waitForTimeout(600); await p1.screenshot({ path: `${SHOTS}/wall-2-dossier-unlocked.png`, fullPage: true });
  await p1.reload(); await expect(p1.getByRole("heading", { name: `GROUP ${mates.group} MATCHED — DOSSIER OPEN` })).toBeVisible(); // survives a refresh
  await ctx.clearCookies(); await team(p1, first); await p1.goto("/play/insider"); await expect(p1.getByRole("heading", { name: `GROUP ${mates.group} MATCHED — DOSSIER OPEN` })).toBeVisible(); // and a re-login
  expect((await (await p1.request.get("/api/game")).json()).score).toBe(40); // 15 + 25: the match scored nothing

  // the team-mate of the same group: still sealed, then unlocks with the very same two codes
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p2 = await ctx2.newPage(); await team(p2, second); await p2.goto("/play/insider");
  await expect(p2.getByRole("heading", { name: `Match your Group ${mates.group} fragment` })).toBeVisible(); await match(p2, mates.priv, mates.pub); await expect(p2.getByRole("heading", { name: `GROUP ${mates.group} MATCHED — DOSSIER OPEN` })).toBeVisible({ timeout: 15_000 });
  // a team of ANOTHER group cannot use this pair
  const ctx3 = await browser.newContext(), p3 = await ctx3.newPage(); await team(p3, other); await p3.goto("/play/insider"); await match(p3, mates.priv, mates.pub); await expect(p3.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible();
  expect((await (await p3.request.get("/api/game")).json()).insiderUnlocked).toBe(false); await ctx2.close(); await ctx3.close();
  expect(problems).toEqual([]); await ctx.close();
});
