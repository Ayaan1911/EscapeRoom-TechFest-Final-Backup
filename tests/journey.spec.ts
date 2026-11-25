import { expect, test, type Page } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { readCards } from "./fixtures/insider-browser";
import { tamperAnswer } from "./fixtures/inbox";
import { solveInbox, solveTrail, solveInsider, solveContainment, solveVerdict } from "./fixtures/ui";

test.skip(!process.env.GHOST_E2E_JOURNEY, "Run npm run test:e2e:journey (fresh zero-progress team on a disposable database)");

const V = "A" as const, TEAM = "DEMO-A";
const origin = `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}`;

async function signIn(page: Page, role: "team" | "admin") {
  await page.goto(role === "admin" ? "/organizer/login" : "/login");
  if (role === "team") await page.getByLabel("Team ID", { exact: true }).fill(TEAM);
  await page.getByLabel("Access code", { exact: true }).fill(role === "admin" ? process.env.GHOST_E2E_ADMIN_CODE! : process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: role === "admin" ? "Event operations" : "Investigation dashboard", exact: true })).toBeVisible({ timeout: 30_000 });
}
// Post-completion navigation: the Open-next action appears only once the server says the chapter is done, and never navigates by itself.
async function expectContinue(page: Page, next: number, from: string) {
  const link = page.getByRole("link", { name: `Open Chapter ${next} →`, exact: true });
  await expect(link).toBeVisible();
  await page.waitForTimeout(1500); expect(new URL(page.url()).pathname).toBe(from); // never auto-navigates
  await page.reload(); await expect(link).toBeVisible(); // persists across a refresh (derived from saved server state)
}
async function openChapter(page: Page, n: number) { await page.goto("/play"); await page.getByRole("link", { name: `Open Chapter ${n}`, exact: true }).click(); }
/** Cumulative layout shift of the current document (buffered entries). */
const layoutShift = (page: Page) => page.evaluate(() => new Promise<number>(resolve => {
  let sum = 0; const observer = new PerformanceObserver(list => { for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) sum += entry.value; });
  observer.observe({ type: "layout-shift", buffered: true }); setTimeout(() => { observer.disconnect(); resolve(sum); }, 400);
}));

test("fresh team plays Login → Inbox → Trail → Insider → Containment → Verdict → CASE CLOSED with an organizer in the same browser profile", async ({ browser }) => {
  test.setTimeout(600_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const team = await context.newPage(), admin = await context.newPage();
  const problems: string[] = [], shifts: Record<string, number> = {};
  team.on("pageerror", error => problems.push(`pageerror ${error.message}`));
  team.on("console", message => { if (message.type() === "error") problems.push(`console ${message.text()}`); });
  team.on("response", response => { if (response.status() >= 400 && !response.url().includes("/api/game/")) problems.push(`${response.status()} ${response.url()}`); });
  const external: string[] = []; team.on("request", request => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });

  // 1. organizer and team sign in within ONE profile; the round has not started
  await signIn(admin, "admin"); await signIn(team, "team");
  await expect(team.getByRole("heading", { name: "Awaiting organizer start" })).toBeVisible();
  expect((await team.request.get("/api/game/trail")).status()).toBe(403); // chapter locks hold even by direct URL
  await team.goto("/play/trail"); await expect(team).toHaveURL(/\/play$/);
  shifts.dashboard = await layoutShift(team);

  // 2. organizer starts the round (confirmation required); team sees chapters open without reloading
  await admin.getByRole("button", { name: "Start 60-minute round" }).click(); await confirmDialog(admin);
  await expect(admin.getByRole("button", { name: "Stop round" })).toBeEnabled();
  await expect(team.getByRole("link", { name: "Open Chapter 1", exact: true })).toBeVisible({ timeout: 15_000 });

  // 3. Inbox (with the one-time Tamper Alert bonus), solved task by task
  await team.getByRole("link", { name: "Open Chapter 1", exact: true }).click();
  await expect(team.getByRole("heading", { level: 1, name: "The Inbox", exact: true })).toBeVisible(); shifts.inbox = await layoutShift(team);
  const tamper = tamperAnswer(V);
  await team.locator("summary", { hasText: "Tamper Alert" }).click();
  await team.getByLabel("Manipulation email").selectOption(tamper.emailId); await team.getByLabel("Manipulation artifact").selectOption(tamper.artifactId); await team.getByLabel("Manipulation technique").selectOption(tamper.technique);
  await team.getByRole("button", { name: "Record Tamper Alert" }).click(); await expect(team.getByText("Tamper Alert bonus already recorded: +5.")).toBeVisible();
  await solveInbox(team, V);
  await expect(team.getByText("Chapter 1 completed. Chapter 2 unlocked.").first()).toBeVisible();
  await expectContinue(team, 2, "/play/inbox");

  // 4. Trail
  await openChapter(team, 2); await expect(team.getByRole("heading", { level: 1, name: "Trail", exact: true })).toBeVisible(); shifts.trail = await layoutShift(team);
  await solveTrail(team, V);
  await expect(team.getByText("Chapter 2 completed. Chapter 3 unlocked.").first()).toBeVisible();
  await expectContinue(team, 3, "/play/trail");

  // 5. Insider: the organizer prints this team's private fragment (A) and the public wall fragment (B)
  await admin.goto("/admin/insider-kit"); await admin.getByRole("checkbox", { name: new RegExp(`^${TEAM} `) }).check();
  await admin.getByRole("button", { name: "Prepare selected teams", exact: true }).click(); const partA = (await readCards(admin))[0].fragment;
  await admin.getByRole("combobox", { name: "Sheet type", exact: true }).selectOption("B"); await admin.getByRole("button", { name: "Prepare selected teams", exact: true }).click(); const partB = (await readCards(admin))[0].fragment;
  await openChapter(team, 3); await expect(team.getByRole("heading", { level: 1, name: "Insider", exact: true })).toBeVisible();
  await team.getByLabel("Fragment A", { exact: true }).fill(partA); await team.getByLabel("Fragment B", { exact: true }).fill(partB);
  await team.getByRole("button", { name: "Unlock dossier", exact: true }).click(); await expect(team.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible(); shifts.insider = await layoutShift(team);
  await solveInsider(team, V);
  await expect(team.getByText("Chapter 3 completed. Chapter 4 unlocked.").first()).toBeVisible();
  await expectContinue(team, 4, "/play/insider");

  // 6. Containment: keyboard-operable ordering
  await openChapter(team, 4); await expect(team.getByRole("heading", { level: 1, name: "Containment", exact: true })).toBeVisible(); shifts.containment = await layoutShift(team);
  await solveContainment(team, V);
  await expect(team.getByText("Chapter 4 completed. Chapter 5 unlocked.").first()).toBeVisible();
  await expectContinue(team, 5, "/play/containment");

  // 7. Final Verdict
  await openChapter(team, 5); await expect(team.getByRole("heading", { level: 1, name: "Final Verdict", exact: true })).toBeVisible(); shifts.verdict = await layoutShift(team);
  await solveVerdict(team, V);
  await expect(team.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(team.locator(".case-closed")).toContainText("105 / 105");
  await expect(team.locator("#case-closed")).toBeVisible(); // the result is shown in place; no separate jump link is needed

  // 8. the finished team stays signed in (no "Session expired"), the organizer session is independent, and the board shows the result
  await team.waitForTimeout(11_000);
  await expect(team.getByText(/Session expired/)).toHaveCount(0);
  expect((await team.request.get("/api/game")).status()).toBe(200); expect((await team.request.get("/api/admin/scores")).status()).toBe(200); // same profile holds both cookies
  await admin.goto("/admin"); await expect(admin.getByRole("row").filter({ hasText: TEAM }).first()).toContainText("105 / 105");
  const saved = await (await team.request.get("/api/game")).json(); expect(saved.score).toBe(105); expect(saved.progress.bonus).toBe(5); expect(saved.chapterHints.flat()).toHaveLength(0);
  expect(JSON.stringify(saved)).not.toMatch(/answerKey|validator|solution/i);

  // 9. quality gates for the whole journey
  expect(problems, problems.join("\n")).toEqual([]);
  expect(external, "no third-party requests").toEqual([]);
  for (const [name, value] of Object.entries(shifts)) expect(value, `layout shift on ${name}`).toBeLessThan(0.25);
  await context.close();
});
