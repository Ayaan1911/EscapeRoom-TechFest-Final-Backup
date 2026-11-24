import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

// Evidence Wall, GROUP MODE: one assigned group A/B/C per team, one private fragment + its own public card. Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts
// (disposable local database; Round 1 active; UI-A..D are fixture teams; no real roster or credential is created).
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/evidence-wall.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/wall"; mkdirSync(SHOTS, { recursive: true });
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
test.afterAll(async () => { await prisma.$disconnect(); });

async function organizerSheets(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/admin/insider-kit");
  const summary = page.getByRole("region", { name: "Evidence Wall group summary" });
  await expect(summary).toContainText("Not prepared yet"); await expect(summary).toContainText("Teams registered"); await page.screenshot({ path: `${SHOTS}/0-kit-before.png`, fullPage: true });
  await page.locator('select[name="view"]').selectOption("map"); await page.getByRole("button", { name: "Prepare group assignment (all teams)" }).click();
  const map = page.getByRole("region", { name: "Organizer code map" }); await expect(map).toBeVisible();
  await expect(summary).toContainText(/Demonstration roster: \d+ teams/); // not the final 30: labelled, never called "final"
  const slips: Record<string, { group: string; code: string }> = {}, cards: { group: string; role: string; team: string; code: string }[] = [];
  for (const row of await map.locator("tr[data-team-id]").all()) slips[(await row.getAttribute("data-team-id"))!] = { group: (await row.getAttribute("data-group"))!, code: (await row.locator("code").innerText()).trim() };
  for (const row of await map.locator("tr[data-wall-role]").all()) { const [group, , team, cardCode] = (await row.locator("td").allInnerTexts()).map(t => t.trim()); cards.push({ group, role: (await row.getAttribute("data-wall-role"))!, team, code: cardCode }); }
  await page.screenshot({ path: `${SHOTS}/1-kit-after-map.png`, fullPage: true });
  return { slips, cards, summary };
}
async function team(page: Page, id: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function match(page: Page, priv: string, pub: string) {
  const button = page.getByRole("button", { name: "Match fragments" }); await expect(button).toBeEnabled({ timeout: 15_000 }); // the 3-second spacing between attempts is real
  await page.getByLabel("Private fragment code").fill(priv); await page.getByLabel("Wall card code").fill(pub); await button.click();
}

test("organizer prepares groups once; a player matches ONE assigned pair and the whole dossier opens", async ({ browser, page }) => {
  test.setTimeout(240_000);
  for (const id of ["UI-A", "UI-B"]) { const p = JSON.parse((await prisma.team.findUniqueOrThrow({ where: { id } })).progress); p.chapters[0].score = 15; p.chapters[0].unlockedAt = 1; p.chapters[1].score = 25; p.chapters[1].unlockedAt = 1; p.chapters[2].unlockedAt = 1; await prisma.team.update({ where: { id }, data: { progress: JSON.stringify(p) } }); }
  const { slips, cards, summary } = await organizerSheets(page);
  expect(Object.keys(slips)).toEqual(expect.arrayContaining(["UI-A", "UI-B", "UI-C", "UI-D"])); // exactly one private fragment per team (the map has one row per team)
  const counts = ["A", "B", "C"].map(g => Object.values(slips).filter(s => s.group === g).length); expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  expect(cards.filter(c => c.role === "match")).toHaveLength(Object.keys(slips).length); expect(cards.filter(c => c.role === "decoy")).toHaveLength(6);
  const mine = slips["UI-A"], myCard = cards.find(c => c.role === "match" && c.team === "UI-A")!, theirCard = cards.find(c => c.role === "match" && c.team === "UI-B")!, decoy = cards.find(c => c.role === "decoy" && c.group === mine.group)!;
  expect(myCard.group).toBe(mine.group);

  // reprint and re-prepare change nothing; public wall sheet carries codes only; private sheet carries only slips
  await page.goto("/admin/insider-kit"); await page.locator('select[name="view"]').selectOption("wall"); await page.getByRole("button", { name: "Show prepared teams" }).click();
  await expect(page.locator("article[data-group]").first()).toBeVisible({ timeout: 20_000 }); const wallText = (await page.locator(".print-kit-page").allInnerTexts()).join(" "); for (const c of cards) expect(wallText).toContain(c.code);
  for (const s of Object.values(slips)) expect(wallText).not.toContain(s.code); expect(wallText).not.toMatch(/UI-[A-D]\b|decoy|matching card|intended/i); await page.screenshot({ path: `${SHOTS}/2-public-wall-sheet.png`, fullPage: true });
  await page.locator('select[name="view"]').selectOption("slips"); await page.getByRole("button", { name: "Prepare group assignment (all teams)" }).click();
  await expect(page.locator("article[data-team-id]").first()).toBeVisible({ timeout: 20_000 }); const slipText = (await page.locator(".print-kit-page").allInnerTexts()).join(" "); for (const s of Object.values(slips)) expect(slipText).toContain(s.code); for (const c of cards) expect(slipText).not.toContain(c.code);
  await expect(page.locator("article[data-team-id='UI-A']")).toContainText(`GROUP ${mine.group}`); await page.screenshot({ path: `${SHOTS}/3-private-slips.png`, fullPage: true });
  await page.locator('select[name="view"]').selectOption("map"); await page.getByRole("button", { name: "Prepare group assignment (all teams)" }).click();
  const again = page.getByRole("region", { name: "Organizer code map" }); expect((await again.locator("tr[data-team-id='UI-A'] code").innerText()).trim()).toBe(mine.code); await expect(summary).toContainText("Demonstration roster");

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p1 = await ctx.newPage(), problems: string[] = [];
  p1.on("pageerror", e => problems.push(e.message)); p1.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await team(p1, "UI-A"); await p1.goto("/play/insider");
  await expect(p1.getByRole("heading", { name: `Match your Group ${mine.group} fragment` })).toBeVisible();
  await expect(p1.getByText("Sealed folder")).toHaveCount(0); await expect(p1.getByText(/Evidence set|folders? reconstructed/i)).toHaveCount(0); // no three-folder wording for a group team
  await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toHaveCount(0); // nothing of the dossier before a match
  const html = await p1.content(); for (const c of [...Object.values(slips).map(s => s.code), ...cards.map(c => c.code)]) expect(html).not.toContain(c);
  const others = Object.entries(slips).filter(([id]) => id !== "UI-A").map(([, s]) => s.group); void others; await p1.screenshot({ path: `${SHOTS}/4-before-matching.png` });

  await match(p1, mine.code, mine.group); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // the letter alone is not an answer
  await match(p1, mine.code, decoy.code); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // a lookalike
  await match(p1, mine.code, theirCard.code); await expect(p1.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible(); // another team's card
  await expect(p1.getByRole("heading", { name: `Match your Group ${mine.group} fragment` })).toBeVisible();

  await match(p1, mine.code, myCard.code);
  await expect(p1.getByRole("heading", { name: `GROUP ${mine.group} MATCHED — DOSSIER OPEN` })).toBeVisible({ timeout: 15_000 });
  await expect(p1.getByRole("status").filter({ hasText: "Match confirmed" })).toBeVisible();
  await expect(p1.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(p1.getByRole("region", { name: "Scored tasks" })).toBeVisible({ timeout: 15_000 }); await expect(p1.getByRole("button", { name: "Match fragments" })).toHaveCount(0); // no other folder or fragment is asked for
  expect(await p1.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await p1.screenshot({ path: `${SHOTS}/5-dossier-unlocked.png`, fullPage: true });
  await p1.reload(); await expect(p1.getByRole("heading", { name: `GROUP ${mine.group} MATCHED — DOSSIER OPEN` })).toBeVisible(); // survives a refresh
  const again2 = await ctx.newPage(); await again2.goto("/play/insider"); await expect(again2.getByRole("heading", { name: `GROUP ${mine.group} MATCHED — DOSSIER OPEN` })).toBeVisible(); await again2.close(); // and a new tab
  await ctx.clearCookies(); await team(p1, "UI-A"); await p1.goto("/play/insider"); await expect(p1.getByRole("heading", { name: `GROUP ${mine.group} MATCHED — DOSSIER OPEN` })).toBeVisible(); // and a re-login

  // a different team cannot ride on UI-A's fragments, and sees only its own group letter
  const ctx2 = await browser.newContext(), p2 = await ctx2.newPage(); await team(p2, "UI-B");
  const stateB = await (await p2.request.get("/api/game")).json(); expect(stateB.insiderGroup).toEqual({ group: slips["UI-B"].group, solved: false }); expect(JSON.stringify(stateB)).not.toContain(mine.code); expect(JSON.stringify(stateB)).not.toContain(myCard.code);
  await p2.goto("/play/insider"); await match(p2, mine.code, myCard.code); await expect(p2.getByRole("status").filter({ hasText: "do not fit together" })).toBeVisible();
  expect((await (await p2.request.get("/api/game")).json()).insiderUnlocked).toBe(false); await ctx2.close();
  expect((await (await p1.request.get("/api/game")).json()).score).toBe(40); // 15 + 25: the match scored nothing
  expect(problems).toEqual([]); await ctx.close();
});
