import { expect, test, type Page } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { readCards } from "./fixtures/insider-browser";
import { inboxAnswers, tamperAnswer } from "./fixtures/inbox";
import { trailAnswers } from "./fixtures/trail";
import { insiderAnswers } from "./fixtures/insider";
import { containmentAnswers } from "./fixtures/containment";
import { verdictAnswers } from "./fixtures/verdict";

test.skip(!process.env.GHOST_E2E_JOURNEY, "Run npm run test:e2e:journey (fresh zero-progress team on a disposable database)");

const V = "A" as const, TEAM = "DEMO-A";
const origin = "http://127.0.0.1:3000";

async function signIn(page: Page, role: "team" | "admin") {
  await page.goto(role === "admin" ? "/organizer/login" : "/login");
  if (role === "team") await page.getByLabel("Team ID", { exact: true }).fill(TEAM);
  await page.getByLabel("Access code", { exact: true }).fill(role === "admin" ? process.env.GHOST_E2E_ADMIN_CODE! : process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: role === "admin" ? "Event operations" : "Investigation dashboard", exact: true })).toBeVisible();
}
async function arrange(page: Page, kind: "event" | "recovery", target: readonly string[]) {
  const attribute = kind === "event" ? "data-event-id" : "data-recovery-id";
  for (const [position, id] of target.entries()) {
    while ((await page.locator(`[${attribute}]`).evaluateAll((cards, attr) => cards.map(card => card.getAttribute(attr)), attribute)).indexOf(id) > position) await page.getByRole("button", { name: `Move ${kind} ${id} up`, exact: true }).click();
  }
  await expect(page.locator(`input[name=${kind === "event" ? "eventOrder" : "recoveryOrder"}]`)).toHaveValue(JSON.stringify(target));
}
// Post-completion navigation: the Continue action sits under the submission message (below the submit button), appears only once the server says the chapter is done, and never navigates by itself.
async function expectContinue(page: Page, next: number, from: string) {
  const link = page.getByRole("link", { name: `Continue to Chapter ${next} →`, exact: true });
  await expect(link).toBeVisible();
  const submit = await page.locator(".k-submit-row button").first().boundingBox(), box = await link.boundingBox();
  expect(box!.y).toBeGreaterThan(submit!.y); // directly below the form, not at the top of the page
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
  test.setTimeout(300_000);
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

  // 3. Inbox (with the one-time Tamper Alert bonus)
  await team.getByRole("link", { name: "Open Chapter 1", exact: true }).click();
  await expect(team.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible(); shifts.inbox = await layoutShift(team);
  const tamper = tamperAnswer(V);
  await team.getByLabel("Manipulation email").selectOption(tamper.emailId); await team.getByLabel("Manipulation artifact").selectOption(tamper.artifactId); await team.getByLabel("Manipulation technique").selectOption(tamper.technique);
  await team.getByRole("button", { name: "Record Tamper Alert" }).click(); await expect(team.getByText("Tamper Alert bonus already recorded: +5.")).toBeVisible();
  const inbox = inboxAnswers[V];
  await team.getByLabel("Initial compromise email").selectOption(inbox.emailId); await team.getByLabel("Delivery / navigation evidence").selectOption(inbox.deliveryId);
  await team.getByLabel("Snapshot evidence ID").fill(inbox.snapshotId); await team.getByLabel("Authentication evidence").selectOption(inbox.authenticationId);
  await team.getByLabel("Database export evidence").selectOption(inbox.databaseId); await team.getByLabel("Correlated session ID").fill(inbox.sessionId);
  await expect(team.getByRole("button", { name: "Submit conclusion" })).toBeEnabled({ timeout: 8000 }); await team.getByRole("button", { name: "Submit conclusion" }).click();
  await expect(team.getByText("Chapter 1 completed. Chapter 2 unlocked.", { exact: true })).toBeVisible();
  await expectContinue(team, 2, "/play/inbox");

  // 4. Trail
  await openChapter(team, 2); await expect(team.getByRole("heading", { name: "Trail", exact: true })).toBeVisible(); shifts.trail = await layoutShift(team);
  const trail = trailAnswers[V];
  await team.getByLabel("Compromised account", { exact: true }).fill(trail.account); await team.getByLabel("Attacker source IP", { exact: true }).fill(trail.sourceIp);
  await team.getByLabel("Incident session ID", { exact: true }).fill(trail.sessionId); await team.getByLabel("Relevant authentication event ID", { exact: true }).fill(trail.eventId);
  await team.getByLabel("Supporting evidence IDs (exactly three)", { exact: true }).fill(trail.supportingEvidenceIds.join(", "));
  await expect(team.getByRole("button", { name: "Submit Trail conclusion", exact: true })).toBeEnabled({ timeout: 8000 }); await team.getByRole("button", { name: "Submit Trail conclusion", exact: true }).click();
  await expect(team.getByText("Chapter 2 completed. Chapter 3 unlocked.", { exact: true })).toBeVisible();
  await expectContinue(team, 3, "/play/trail");

  // 5. Insider: the organizer prints this team's private fragment (A) and the public wall fragment (B)
  await admin.goto("/admin/insider-kit"); await admin.getByRole("checkbox", { name: new RegExp(`^${TEAM} `) }).check();
  await admin.getByRole("button", { name: "Prepare selected teams", exact: true }).click(); const partA = (await readCards(admin))[0].fragment;
  await admin.getByRole("combobox", { name: "Sheet type", exact: true }).selectOption("B"); await admin.getByRole("button", { name: "Prepare selected teams", exact: true }).click(); const partB = (await readCards(admin))[0].fragment;
  await openChapter(team, 3); await expect(team.getByRole("heading", { name: "Insider", exact: true })).toBeVisible();
  await team.getByLabel("Fragment A", { exact: true }).fill(partA); await team.getByLabel("Fragment B", { exact: true }).fill(partB);
  await team.getByRole("button", { name: "Unlock dossier", exact: true }).click(); await expect(team.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible(); shifts.insider = await layoutShift(team);
  const insider = insiderAnswers[V];
  for (const evidenceId of insider.supportingEvidenceIds) {
    await team.getByLabel("Search dossier", { exact: true }).fill(evidenceId);
    await team.getByRole("region", { name: "Dossier records", exact: true }).getByRole("button").first().click();
    await team.getByRole("button", { name: "Pin evidence ID", exact: true }).click();
  }
  await team.getByRole("combobox", { name: "Insider employee", exact: true }).selectOption(insider.employeeId); await team.getByRole("combobox", { name: "Unauthorized policy action", exact: true }).selectOption(insider.actionId);
  await expect(team.getByRole("button", { name: "Submit Insider conclusion", exact: true })).toBeEnabled({ timeout: 8000 }); await team.getByRole("button", { name: "Submit Insider conclusion", exact: true }).click();
  await expect(team.getByText("Chapter 3 completed. Chapter 4 unlocked.", { exact: true })).toBeVisible();
  await expectContinue(team, 4, "/play/insider");

  // 6. Containment: drag AND keyboard ordering
  await openChapter(team, 4); await expect(team.getByRole("heading", { name: "Containment", exact: true })).toBeVisible(); shifts.containment = await layoutShift(team);
  const cont = containmentAnswers[V], order = team.locator("input[name=eventOrder]"), before = JSON.parse(await order.inputValue()) as string[];
  await team.locator(`[data-event-id="${before[1]}"]`).dragTo(team.locator(`[data-event-id="${before[0]}"]`)); // pointer drag: 2nd card dropped on the 1st (both visible together)
  await expect.poll(async () => (JSON.parse(await order.inputValue()) as string[])[0]).toBe(before[1]);
  const dragged = JSON.parse(await order.inputValue()) as string[]; expect(dragged).toHaveLength(7);
  await team.getByRole("button", { name: `Move event ${dragged[0]} down`, exact: true }).focus(); await team.keyboard.press("Space"); // keyboard alternative
  await expect(team.getByText(`${dragged[0]} moved to position 2 of 7.`, { exact: true })).toBeVisible();
  await arrange(team, "event", cont.eventOrder);
  for (const evidenceId of cont.supportingEvidenceIds) await team.getByRole("checkbox", { name: `Pin evidence ${evidenceId}`, exact: true }).check();
  for (const action of cont.immediateActions) await team.getByRole("checkbox", { name: `Select immediate ${action}`, exact: true }).check();
  for (const action of [...cont.recoveryOrder].reverse()) await team.getByRole("checkbox", { name: `Select recovery ${action}`, exact: true }).check();
  await arrange(team, "recovery", cont.recoveryOrder);
  await team.getByLabel("Affected account", { exact: true }).fill(cont.account); await team.getByLabel("Affected session", { exact: true }).fill(cont.sessionId);
  await expect(team.getByRole("button", { name: "Submit containment plan", exact: true })).toBeEnabled({ timeout: 8000 }); await team.getByRole("button", { name: "Submit containment plan", exact: true }).click();
  await expect(team.getByText("Chapter 4 completed. Chapter 5 unlocked.", { exact: true })).toBeVisible();
  await expectContinue(team, 5, "/play/containment");

  // 7. Final Verdict
  await openChapter(team, 5); await expect(team.getByRole("heading", { name: "Final Verdict", exact: true })).toBeVisible(); shifts.verdict = await layoutShift(team);
  const verdict = verdictAnswers[V];
  for (const [label, value] of Object.entries({ "Initial compromise email": verdict.chain.emailId, "Victim account": verdict.chain.victimAccount, "Captured redirect evidence": verdict.chain.captureId, "Replayed incident session": verdict.chain.sessionId, "Unauthorized export evidence": verdict.chain.exportId, "Internal accomplice": verdict.chain.insiderId, "Unauthorized policy modification": verdict.chain.policyId })) await team.getByRole("combobox", { name: label, exact: true }).selectOption(value);
  for (const [role, evidenceIds] of Object.entries(verdict.evidenceMap)) for (const evidenceId of evidenceIds) await team.getByRole("combobox", { name: `Evidence role for ${evidenceId}`, exact: true }).selectOption(role);
  for (const evidenceId of verdict.rejected.evidenceIds) await team.getByRole("checkbox", { name: `Counter-evidence ${evidenceId}`, exact: true }).check();
  for (const [label, value] of Object.entries({ "Best-supported hypothesis": verdict.hypothesisId, "Rejected competing hypothesis": verdict.rejected.hypothesisId, "Contradiction established by records": verdict.rejected.contradiction, "External attacker attribution": "alias-only", "Response conclusion": "plan-prepared" })) await team.getByRole("combobox", { name: label, exact: true }).selectOption(value);
  await expect(team.getByRole("button", { name: "Submit Final Verdict", exact: true })).toBeEnabled({ timeout: 8000 }); await team.getByRole("button", { name: "Submit Final Verdict", exact: true }).click();
  await expect(team.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible();
  await expect(team.locator(".case-closed")).toContainText("105 / 105");
  await expect(team.getByRole("link", { name: "View CASE CLOSED ↑", exact: true })).toBeVisible();

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
