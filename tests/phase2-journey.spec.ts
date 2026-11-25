import { expect, test, type Page } from "@playwright/test";
import { taskAnswer } from "./fixtures/tasks";
import { solveInbox, submitTask, openTool, closeAllTools } from "./fixtures/ui";
import { trailAnswers } from "./fixtures/trail";

// Critical player journey (Phase 2 acceptance), once per case variant, on disposable P2-J-* teams:
// 8/15 Inbox unlocks Trail -> 13/25 Trail unlocks Insider -> back to Inbox -> finish it -> more Trail -> reload -> re-login -> Insider still sealed.
async function login(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Team ID").fill(id);
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible({ timeout: 30_000 });
}
const state = async (page: Page) => (await page.request.get("/api/game")).json();
const raw = (s: { progress: { chapters: { score: number }[] } }) => s.progress.chapters.map(c => c.score);
const map = (page: Page) => page.getByRole("navigation", { name: "Investigation map" });

for (const V of ["A", "B", "C"] as const) test(`critical journey, variant ${V}`, async ({ page }) => {
  test.setTimeout(180_000);
  const id = `P2-J-${V}`, trail = trailAnswers[V], entry = taskAnswer("inbox.entry", V) as Record<string, string>, ident = taskAnswer("inbox.identity", V) as Record<string, string>;
  await login(page, id);

  // 1-3. Inbox: only the email (2) + the full identity task (6) = exactly 8/15 -> Trail unlocks while Inbox is incomplete
  await page.goto("/play/inbox");
  await page.getByRole("complementary", { name: "Recovered emails" }).getByRole("button").filter({ hasText: entry.emailId }).click();
  await page.getByRole("button", { name: /Mark as breach email/ }).click();
  const wrongDelivery = (await page.getByLabel("Delivery / navigation record").locator("option").evaluateAll(o => o.map(x => (x as HTMLOptionElement).value))).find(v => v && v !== entry.deliveryId)!;
  await page.getByLabel("Delivery / navigation record").selectOption(wrongDelivery); await page.getByLabel("Capture ID").fill("CAP-WRONG-00");
  await submitTask(page, "Delivery and entry point", /\+2 points/);
  await page.getByLabel("Sign-in record").selectOption(ident.authenticationId); await page.getByLabel("Session ID").fill(ident.sessionId);
  await submitTask(page, "Authentication and session", /\+6 points/);
  expect(raw(await state(page))[0]).toBe(8);
  await expect(page.getByRole("link", { name: /Trail unlocked/ })).toBeVisible();
  expect((await state(page)).progress.chapters[0].completedAt).toBeNull();
  await expect(page.getByText(/Chapter 1 completed/)).toHaveCount(0);

  // 4-6. Trail by the map: account (4) + event (6) + database audit (3, with two non-solution pins) = exactly 13/25 -> Insider unlocks
  await map(page).getByRole("link", { name: /Trail/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Trail" })).toBeVisible();
  await page.getByLabel("Compromised account", { exact: true }).fill(trail.account); await page.getByLabel("Attacker source IP", { exact: true }).fill("198.51.100.77");
  await submitTask(page, "Compromised account and source", /\+4 points/);
  await page.getByLabel("Incident session ID", { exact: true }).fill("nx-wrong-session"); await page.getByLabel("Replay event ID", { exact: true }).fill(trail.eventId);
  await submitTask(page, "Replayed session and event", /\+6 points/);
  await openTool(page, "console");
  const inspect = await page.getByRole("button", { name: /^Inspect EV-/ }).evaluateAll(b => b.map(x => x.getAttribute("aria-label")!.replace("Inspect ", "")));
  const decoys = inspect.filter(x => !(trail.supportingEvidenceIds as readonly string[]).includes(x) && x !== trail.eventId).slice(0, 2);
  expect(decoys).toHaveLength(2);
  for (const d of decoys) { await page.getByLabel("Search records", { exact: true }).fill(d); await page.getByRole("button", { name: `Inspect ${d}`, exact: true }).click(); const pin = page.getByRole("button", { name: /Pin as evidence/ }); if (await pin.count()) await pin.click(); }
  await openTool(page, "records");
  await page.getByRole("button", { name: `Pin ${trail.supportingEvidenceIds[2]}`, exact: true }).click();
  await closeAllTools(page);
  await submitTask(page, "Corroborating evidence", /\+3 points/);
  expect(raw(await state(page)).slice(0, 2)).toEqual([8, 13]);
  await expect(page.getByRole("link", { name: /Insider unlocked/ })).toBeVisible();

  // 7-9. back to Inbox (browser back), finish it: earlier points kept, nothing duplicated
  await page.goBack(); await expect(page.getByRole("heading", { level: 1, name: "The Inbox" })).toBeVisible();
  await solveInbox(page, V);
  expect(raw(await state(page)).slice(0, 2)).toEqual([15, 13]);
  expect((await state(page)).score).toBe(28);
  // a completed chapter is read-only: replaying a solved task over the API changes nothing
  await page.request.post("/api/game", { headers: { Origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` }, data: { action: "submit", chapter: 0, task: "inbox.impact", answer: ident } });
  expect(raw(await state(page)).slice(0, 2)).toEqual([15, 13]);

  // 10-13. back to Trail: work is still there; one more task; notes draft survives a reload
  await map(page).getByRole("link", { name: /Trail/ }).click();
  await expect(page.getByLabel("Compromised account", { exact: true })).toHaveValue(trail.account);
  await page.getByLabel("Incident session ID", { exact: true }).fill(trail.sessionId);
  await submitTask(page, "Replayed session and event", /\+4 points/);
  expect(raw(await state(page)).slice(0, 2)).toEqual([15, 17]);
  await page.locator("summary", { hasText: "Notes" }).click(); await page.getByLabel("Scratchpad").fill(`journey note ${V}`);
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({ timeout: 15_000 });
  await page.reload(); await page.locator("summary", { hasText: "Notes" }).click(); await expect(page.getByLabel("Scratchpad")).toHaveValue(`journey note ${V}`);
  await expect(page.getByLabel("Compromised account", { exact: true })).toHaveValue(trail.account);

  // 14-15. log out and back in: unlocks, drafts and scores persist
  await page.getByRole("button", { name: /Sign out|Log out/ }).click(); await login(page, id);
  const again = await state(page); expect(raw(again).slice(0, 2)).toEqual([15, 17]); expect(again.unlocked.slice(0, 3)).toEqual([true, true, true]); expect(again.progress.chapters[2].score).toBe(0);
  await page.goto("/play/trail"); await page.locator("summary", { hasText: "Notes" }).click(); await expect(page.getByLabel("Scratchpad")).toHaveValue(`journey note ${V}`);

  // 16. Insider is reachable by points but the physical fragments still gate it
  await page.goto("/play/insider"); await expect(page.getByText("Combine your two physical fragments")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit task" })).toHaveCount(0);
  const denied = await page.request.post("/api/game", { headers: { Origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` }, data: { action: "submit", chapter: 2, task: "insider.suspect", answer: { employeeId: "EMP-A-04" } } });
  expect(denied.status()).toBeGreaterThanOrEqual(400); expect(raw(await state(page))[2]).toBe(0);

  // 18. direct URLs: locked chapters bounce back, history navigation works
  await page.goto("/play/containment"); await expect(page).toHaveURL(/\/play$/);
  await page.goto("/play/inbox"); await page.goto("/play/trail"); await page.goBack(); await expect(page.getByRole("heading", { level: 1, name: "The Inbox" })).toBeVisible();
  await page.goForward(); await expect(page.getByRole("heading", { level: 1, name: "Trail" })).toBeVisible();
});
