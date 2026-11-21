import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { inboxAnswers } from "./fixtures/inbox";
import { submitTask } from "./fixtures/ui";

test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs (disposable local database)");
test.describe.configure({ mode: "serial" });
const ORIGIN = "http://127.0.0.1:3000";
async function login(page: Page, id: string) {
  await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
}
async function entry(page: Page, v: "A" | "B" | "C") {
  const x = inboxAnswers[v];
  await page.getByRole("complementary", { name: "Recovered emails" }).getByRole("button").filter({ hasText: x.emailId }).click();
  const mark = page.getByRole("button", { name: /Mark as breach email/ }); if (await mark.count()) await mark.click();
  await page.getByLabel("Delivery / navigation record").selectOption(x.deliveryId); await page.getByLabel("Capture ID").fill(x.snapshotId);
  await submitTask(page, "Delivery and entry point");
}

test("below the threshold the next chapter stays locked (UI and server), and a modified client cannot bypass the lock", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "UI-A"); await page.goto("/play/inbox");
  await entry(page, "A"); // 6 of the 8 needed
  const footer = page.getByRole("navigation", { name: "Chapter navigation" });
  await expect(footer).toContainText("more point"); await expect(footer).toContainText("Chapter 2 — Trail");
  await expect(page.getByRole("link", { name: /Continue to Chapter 2/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chapter 2 Unlocked" })).toHaveCount(0);
  await page.goto("/play/trail"); await expect(page).toHaveURL(/\/play$/); // server-side route lock
  const forged = await page.request.post("/api/game", { headers: { Origin: ORIGIN }, data: { action: "submit", chapter: 1, task: "trail.source", answer: {} } });
  expect(forged.status()).toBeGreaterThanOrEqual(400); // a locked chapter refuses the submission
  const state = await (await page.request.get("/api/game")).json(); expect(state.unlocked[1]).toBe(false);
});

test("reaching the threshold shows the unlock at once; Continue navigates, drafts survive, refresh keeps the unlock, going back keeps progress", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "UI-B"); await page.goto("/play/inbox");
  const b = inboxAnswers.B;
  await entry(page, "B");
  await page.getByLabel("Sign-in record").selectOption(b.authenticationId); await page.getByLabel("Session ID").fill("x-wrong-session");
  await submitTask(page, "Authentication and session"); // partial credit pushes the chapter past 8 without completing it
  const notice = page.getByRole("status").filter({ has: page.getByRole("heading", { name: "Chapter 2 Unlocked" }) });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(notice).toContainText("required"); await expect(notice.getByRole("link", { name: "Back to Investigation Dashboard" })).toBeVisible();
  expect((await (await page.request.get("/api/game")).json()).progress.chapters[0].completedAt).toBeNull(); // chapter NOT complete: the unlock came from the threshold
  await notice.getByRole("button", { name: "Keep investigating" }).click(); await expect(notice).toBeHidden();
  const nav = page.getByRole("navigation", { name: "Chapter navigation" });
  await expect(nav.getByRole("link", { name: /Continue to Chapter 2 — Trail/ })).toBeVisible(); // bottom navigation stays after the notice is dismissed
  await page.reload(); await expect(page.getByRole("heading", { name: "Chapter 2 Unlocked" })).toBeVisible(); // refresh preserves the unlock
  await page.getByLabel("Session ID").fill("draft-kept-123"); // unsaved edit, then navigate: drafts are flushed first
  await nav.getByRole("link", { name: /Continue to Chapter 2 — Trail/ }).click();
  await expect(page).toHaveURL(/\/play\/trail$/);
  await page.getByRole("navigation", { name: "Investigation map" }).getByRole("link", { name: /Inbox/ }).click(); await expect(page).toHaveURL(/\/play\/inbox$/);
  await expect(page.getByLabel("Session ID")).toHaveValue("draft-kept-123"); // forward and back lost nothing
  const state = await (await page.request.get("/api/game")).json(); expect(state.progress.chapters[0].score).toBeGreaterThanOrEqual(8); expect(state.unlocked[1]).toBe(true);
  await page.getByRole("navigation", { name: "Chapter navigation" }).getByRole("link", { name: "Back to Investigation Dashboard" }).click(); await expect(page).toHaveURL(/\/play$/);
});

test("an expired round refuses new submissions", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "UI-C"); await page.goto("/play/inbox");
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL }); // the disposable fixture database of this run only
  await db.gameSession.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } }); await db.$disconnect();
  const r = await page.request.post("/api/game", { headers: { Origin: ORIGIN }, data: { action: "submit", chapter: 0, task: "inbox.entry", answer: { emailId: inboxAnswers.C.emailId } } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  const state = await (await page.request.get("/api/game")).json(); expect(state.progress.chapters[0].score).toBe(0);
});
