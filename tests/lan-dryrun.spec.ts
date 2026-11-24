import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { confirmTop10 } from "./fixtures/advance-top10";

// LAN dry-run readiness smoke (one pass, organizer to player) on a DISPOSABLE local database. It is NOT a test on the real college LAN.
// Run (no seed flag: Round 1 closed, 14 teams, nothing confirmed), with the real private key read here at runtime and never printed:
//   GHOST_P5_REAL_KEY=1 node scripts/phase5-e2e.mjs tests/lan-dryrun.spec.ts
test.skip(!existsSync("private/round2-key-v2.json") || process.env.GHOST_P5_REAL_KEY !== "1", "needs the real private key and GHOST_P5_REAL_KEY=1");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), origin = "http://127.0.0.1:3000", seen = new Set<string>();
const key = existsSync("private/round2-key-v2.json") ? JSON.parse(readFileSync("private/round2-key-v2.json", "utf8")).inject2 as { malicious: string[]; cleared: string[]; wrongMessages: Record<string, string>; status: string } : null!;
const ROGUE = key?.malicious ?? [], LEGIT = key?.cleared ?? [];
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const log = (ok: boolean, name: string, note = "") => console.log(`${ok ? "PASS" : "FAIL"} | ${name}${note ? ` | ${note}` : ""}`);
async function step(name: string, fn: () => Promise<string | void>) { try { const note = await fn(); log(true, name, note ?? ""); } catch (e) { log(false, name, (e as Error).message.split("\n")[0].slice(0, 160)); throw e; } }
const watch = (page: Page) => page.context().on("request", r => seen.add(new URL(r.url()).origin));
async function player(browser: Browser, id: string) { const c = await browser.newContext(), p = await c.newPage(); watch(p); await p.goto("/login"); await p.getByLabel("Team ID").fill(id); await p.getByLabel("Access code").fill(code()); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(/\/play/); return { c, p }; }
const term = (p: Page) => p.getByRole("region", { name: "Kill Switch terminal" });
async function openKillSwitch(p: Page) { await p.goto("/round2"); await p.getByRole("navigation", { name: "Injects" }).getByRole("button").nth(1).click(); await expect(term(p)).toBeVisible(); }
async function cmd(p: Page, line: string) { const box = p.getByLabel("Terminal command"); await expect(box).toBeEnabled(); await box.fill(line); await box.press("Enter"); await expect(box).toBeEnabled({ timeout: 10_000 }); }
const left = (p: Page, n: number) => expect(term(p).getByRole("img", { name: `${n} of 4 attempts left` })).toBeVisible();
test.afterAll(async () => { await prisma.$disconnect(); });

test("organizer to player: qualify, start Round 2, play Inject 2 (mixed, success, exhaustion), organizer scores, no external services", async ({ browser, page }) => {
  test.setTimeout(420_000); watch(page); await page.setViewportSize({ width: 1366, height: 768 });
  expect(key.status).toBe("approved"); expect(ROGUE).toHaveLength(2); expect(LEGIT.length).toBe(8);

  await step("1 organizer signs in and sees the event", async () => { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); });
  await step("2 confirm Top 10 and advance (Round 2 not started)", async () => {
    await page.goto("/admin"); await confirmTop10(page, "LAN dry-run: reviewed the final standings");
    await expect(page.getByRole("status").filter({ hasText: /Top 10 confirmed and advanced/ })).toBeVisible({ timeout: 20_000 });
    expect(await prisma.r2Finalist.count({ where: { status: "active" } })).toBe(10); expect(await prisma.r2Session.count()).toBe(0);
  });
  await step("3 private answer key loads server-side (terminal not offline, organizer sees it installed)", async () => {
    const r = await (await page.request.get("/api/round2/admin?view=terminal")).json(); expect(r.keyReady).toBe(true); expect(r.keyStatus).toBe("approved"); expect(r.teams).toHaveLength(10);
  });
  await step("4 a non-qualified team and a reserve team are refused Round 2 (server-side)", async () => {
    for (const id of ["P5-14", "P5-11"]) { const { c, p } = await player(browser, id); for (const url of ["/api/round2/status", "/api/round2/terminal"]) expect((await p.request.get(url)).status(), `${id} ${url}`).toBe(403); await c.close(); }
  });
  await step("5 organizer starts the official 60-minute Round 2 (one start, no format choice)", async () => {
    await page.goto("/admin/round2"); await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByRole("button", { name: "Start Round 2" }).click(); await page.getByRole("button", { name: "Yes, start the 60-minute investigation" }).click();
    await expect(page.getByText("SUGGESTED NOW (ALL INJECTS OPEN)")).toBeVisible({ timeout: 15_000 });
    const t = await (await page.request.get("/api/round2/admin?view=timing")).json(); expect(Date.parse(t.endsAt) - Date.parse(t.startsAt)).toBe(60 * 60_000);
    expect((await page.request.post("/api/round2/admin", { data: { action: "start" }, headers: { origin } })).status()).toBe(409); // cannot start twice
  });

  const a = await player(browser, "P5-01"), b = await player(browser, "P5-02"), c3 = await player(browser, "P5-03"), d = await player(browser, "P5-04");
  await step("6 eligible team opens Inject 2: banner, ten rows, tickets, inspect", async () => {
    await expect(a.p.getByRole("link", { name: "Enter Round 2" })).toBeVisible({ timeout: 20_000 }); await openKillSwitch(a.p);
    await expect(term(a.p)).toContainText("KILL SWITCH ACCESS GRANTED"); await expect(term(a.p)).toContainText("ATTEMPTS LEFT: 4/4");
    await expect(a.p.getByRole("region", { name: "Live connections" }).locator("tbody tr")).toHaveCount(10);
    await a.p.getByRole("button", { name: /inspect connection 6$/ }).click(); await expect(a.p.getByRole("region", { name: "Inspect connection 6" })).toContainText("One tiny packet every 60 seconds");
    await a.p.getByRole("button", { name: /IT ticket log/ }).click(); await expect(a.p.getByText("Standard laptop software needs no ticket: mail-sync.exe.")).toBeVisible(); await expect(a.p.locator(".ks-ticketlist > li")).toHaveCount(8);
  });
  await step("7 invalid and free commands never use an attempt", async () => {
    for (const line of ["BLOK 1.2.3.4", "BLOCK", "BLOCK 203.0.113.999", "BLOCK abc", "BLOCK 8.8.8.8", "BLOCK 1.1.1.1 2.2.2.2", "help", "clear"]) await cmd(a.p, line);
    await left(a.p, 4); expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-01" } })).toBe(0);
    await a.p.waitForTimeout(10_500); // the server allows 6 commands per team per 10 s (a refused command also costs nothing); a person never types that fast
  });
  await step("8 a valid block of a legitimate service uses one attempt; the repeat is free; the row goes grey", async () => {
    await cmd(a.p, `BLOCK ${LEGIT[0]}`); await left(a.p, 3); await expect(term(a.p)).toContainText(`[BLOCKED] ${LEGIT[0]}.`); await expect(a.p.locator(".ks-node.is-cleared")).toHaveCount(1);
    await cmd(a.p, `block ${LEGIT[0]}`); await expect(term(a.p)).toContainText("Already blocked."); await left(a.p, 3);
  });
  await step("9 refresh and a second tab keep the counter and history", async () => {
    await a.p.reload(); await a.p.getByRole("navigation", { name: "Injects" }).getByRole("button").nth(1).click(); await left(a.p, 3); await expect(term(a.p)).toContainText(`BLOCK ${LEGIT[0]}`);
    const tab2 = await a.c.newPage(); watch(tab2); await openKillSwitch(tab2); await left(tab2, 3); await tab2.close();
    await cmd(a.p, `BLOCK ${ROGUE[0]}`); await left(a.p, 2); await expect(a.p.locator(".ks-att.is-warn")).toHaveCount(1); await expect(term(a.p)).toContainText("1 of 2 threats contained.");
  });
  await step("10 success path: both attackers contained on a separate team locks the terminal", async () => {
    await openKillSwitch(b.p); await cmd(b.p, `BLOCK ${ROGUE[0]}`); await cmd(b.p, `BLOCK ${ROGUE[1]}`);
    await expect(term(b.p)).toContainText("[OK] Both threats contained. Terminal locked."); await expect(term(b.p)).toContainText("THREATS CONTAINED"); await cmd(b.p, `BLOCK ${LEGIT[1]}`); await expect(term(b.p)).toContainText("Terminal locked.");
    expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-02" } })).toBe(2); await left(b.p, 2);
  });
  await step("11 exhaustion path: four wrong blocks on another team lock it and survive a re-login", async () => {
    await openKillSwitch(c3.p); for (const ip of LEGIT.slice(0, 3)) await cmd(c3.p, `BLOCK ${ip}`); await left(c3.p, 1); await expect(c3.p.locator(".ks-att.is-bad")).toHaveCount(1);
    await cmd(c3.p, `BLOCK ${LEGIT[3]}`); await expect(term(c3.p)).toContainText("[FAIL] Out of attempts. Terminal locked. See a volunteer.");
    const again = await player(browser, "P5-03"); await openKillSwitch(again.p); await expect(term(again.p)).toContainText("OUT OF ATTEMPTS"); await again.c.close();
    expect(await prisma.r2BlockAttempt.count({ where: { teamId: "P5-03" } })).toBe(4);
  });
  await step("12 the answer key never reaches a team that has not earned it (page, state API, status API)", async () => {
    await openKillSwitch(d.p); const html = await d.p.content(), state = JSON.stringify(await (await d.p.request.get("/api/round2/terminal")).json()), status = JSON.stringify(await (await d.p.request.get("/api/round2/status")).json());
    for (const msg of Object.values(key.wrongMessages)) { expect(html).not.toContain(msg); expect(state).not.toContain(msg); expect(status).not.toContain(msg); }
    expect(state).not.toMatch(/malicious|cleared|wrongMessages|rogue|round2-key/i); expect(status).not.toMatch(/wrongMessages|round2-key|isRogue|"malicious"\s*:|"cleared"\s*:/i); // (Inject 3's own claim text says "malicious program": public content, not the key)
    expect(JSON.parse(state)).toMatchObject({ remaining: 4, contained: 0, attempts: [] });
  });
  await step("13 organizer terminal review shows the server-calculated scores", async () => {
    await page.goto("/admin/round2"); const r = await (await page.request.get("/api/round2/admin?view=terminal")).json() as { teams: { teamId: string; score: number; remaining: number; lockReason: string; untouched: boolean }[] };
    const t = (id: string) => r.teams.find(x => x.teamId === id)!;
    expect(t("P5-01")).toMatchObject({ score: 3, remaining: 2, lockReason: "none" }); // 1 attacker (+5), 1 wrong block (no bonus, -2)
    expect(t("P5-02")).toMatchObject({ score: 15, lockReason: "contained" }); // 2 attackers (+10) + no wrong block (+5)
    expect(t("P5-03")).toMatchObject({ score: 0, remaining: 0, lockReason: "exhausted" }); // 4 wrong blocks: clamped at 0
    expect(t("P5-04")).toMatchObject({ score: 5, untouched: true }); // OWNER DECISION PENDING: literal formula gives an untouched terminal 5
    const row = page.getByRole("region", { name: "Kill Switch terminal review" }).locator("tr", { has: page.getByText("P5-01", { exact: true }) }); await expect(row).toContainText("2 / 4"); await expect(page.getByRole("region", { name: "Kill Switch terminal review" })).toContainText("Answer key installed (approved)");
    return "scores 3 / 15 / 0 / 5(untouched)";
  });
  await step("14 no external internet service: every browser request went to this server only", async () => {
    const hosts = [...seen]; expect(hosts.filter(h => h !== origin && !h.startsWith("data:") && !h.startsWith("blob:")), "external origins").toEqual([]); return `${hosts.length} origin(s): ${hosts.join(", ")}`;
  });
  await step("15 Inject 2 layout: no sideways overflow at 1366x768 and 1920x1080 (two screenshots)", async () => {
    await openKillSwitch(a.p); const dir = "D:/Ghost404-TestWorkspace/shots/ks2";
    for (const [w, h] of [[1366, 768], [1920, 1080]]) { await a.p.setViewportSize({ width: w, height: h }); await a.p.waitForTimeout(400); expect(await a.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${w}x${h}`).toBeLessThanOrEqual(1); await a.p.screenshot({ path: `${dir}/inject2-${w}x${h}.png`, fullPage: true }); }
  });
  for (const x of [a, b, c3, d]) await x.c.close();
});
