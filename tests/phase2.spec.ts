import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { taskAnswer } from "./fixtures/tasks";

// Phase 2 gameplay: task scoring in the UI, flexible navigation, autosave/conflicts, read-only chapters, gating.
// Runs only through scripts/phase2-e2e.mjs (disposable local PostgreSQL + seeded P2-* teams).
const frag = (id: string, part: string) => `${part}-${createHash("sha256").update(id + part).digest("hex").toUpperCase().slice(0, 24).match(/.{6}/g)!.join("-")}`;
async function login(page: Page, id: string) {
  await page.goto("/login");
  await page.getByLabel("Team ID").fill(id);
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible({ timeout: 30_000 });
}
const total = (page: Page) => page.locator(".pg-stats").getByText("/ 105").locator("..").locator("b");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({ timeout: 15_000 });
async function fillInbox(page: Page, variant: "A" | "B" | "C") {
  const entry = taskAnswer("inbox.entry", variant) as Record<string, string>;
  await page.getByRole("button", { name: new RegExp(`^${entry.emailId}`) }).click();
  await page.getByRole("button", { name: /Mark as breach email/ }).click();
  await page.getByLabel("Delivery / navigation record").selectOption(entry.deliveryId);
  await page.getByLabel("Capture ID").fill(entry.snapshotId);
  return entry;
}
async function secondDevice(browser: Browser, id: string) { const context = await browser.newContext(); const page = await context.newPage(); await login(page, id); return { context, page }; }

test("one task alone earns points; partial progress is not 'complete'; thresholds unlock the next chapter", async ({ page }) => {
  await login(page, "P2-FRESH-B");
  await page.goto("/play/trail"); await expect(page).toHaveURL(/\/play$/); // locked chapter cannot be opened by URL
  await page.goto("/play/inbox");
  await expect(page.getByRole("navigation", { name: "Investigation map" }).getByText("Locked").first()).toBeVisible();
  await fillInbox(page, "B");
  await page.getByRole("button", { name: "Submit task" }).first().click();
  await expect(page.getByText(/\+6 points\. Task 6\/6/).first()).toBeVisible();
  await expect(total(page)).toHaveText("6");
  await expect(page.getByText(/Chapter \d completed/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Trail unlocked/ })).toHaveCount(0); // 6 < 8: no false unlock claim
  const answer = taskAnswer("inbox.identity", "B") as Record<string, string>;
  await page.getByLabel("Session ID").fill(answer.sessionId); // wrong sign-in record on purpose: only the session is right
  await page.getByLabel("Sign-in record").selectOption({ index: 1 });
  await page.waitForTimeout(1500);
  const wrongAuth = (await page.getByLabel("Sign-in record").inputValue()) !== answer.authenticationId;
  if (!wrongAuth) await page.getByLabel("Sign-in record").selectOption({ index: 2 });
  const identity = page.getByRole("region", { name: "Authentication and session" });
  await expect(identity.getByRole("button", { name: "Submit task" })).toBeEnabled({ timeout: 8000 }); // server cooldown between submissions
  await identity.getByRole("button", { name: "Submit task" }).click();
  await expect(page.getByText(/Chapter 2 unlocked|Trail unlocked/).first()).toBeVisible({ timeout: 15_000 }); // 6 + 3 = 9 >= 8
  await expect(page.getByRole("link", { name: /Trail unlocked/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Investigation map" }).getByRole("link", { name: /Trail/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Trail" })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { level: 1, name: "The Inbox" })).toBeVisible(); // history works
  await expect(page.getByLabel("Capture ID")).toHaveValue(taskAnswer("inbox.entry", "B").snapshotId as string); // draft survived navigation
  await page.goForward(); await expect(page.getByRole("heading", { level: 1, name: "Trail" })).toBeVisible();
});

test("a stale-looking UI never claims points the server did not award, and responses carry no answer key", async ({ page }) => {
  await login(page, "P2-FRESH-C");
  await page.goto("/play/inbox");
  const bodies: string[] = [];
  page.on("response", async r => { if (r.url().endsWith("/api/game") && r.request().method() === "POST") bodies.push(await r.text()); });
  await page.getByLabel("Capture ID").fill("CAP-WRONG-1");
  await page.getByRole("button", { name: /^MAIL-C-02/ }).click(); await page.getByRole("button", { name: /Mark as breach email/ }).click();
  await page.getByLabel("Delivery / navigation record").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit task" }).first().click();
  await expect(page.getByText(/No new points|No points/).first()).toBeVisible();
  await expect(total(page)).toHaveText("0");
  const text = bodies.join("\n"); expect(text).toContain('"awarded":0'); expect(text).not.toMatch(/criteri|inbox\.entry:|MAIL-C-01|CAP-C-17/);
});

test("drafts: autosave, refresh, re-login, long values and offline retry", async ({ page }) => {
  await login(page, "P2-FRESH-A");
  await page.goto("/play/trail").catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined); // let the locked-chapter redirect finish before navigating again
  await page.goto("/play/inbox");
  const long = "X".repeat(50) + "-long-evidence-identifier"; // 75 chars, within the 80-char field limit
  await page.getByLabel("Capture ID").fill(long);
  await saved(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.reload(); await expect(page.getByLabel("Capture ID")).toHaveValue(long);
  await page.getByRole("button", { name: /Sign out|Log out/ }).click(); await login(page, "P2-FRESH-A"); await page.goto("/play/inbox");
  await expect(page.getByLabel("Capture ID")).toHaveValue(long);
  // network failure: never reported as saved; retried automatically
  await page.route("**/api/game/drafts", route => route.request().method() === "PUT" ? route.abort() : route.continue());
  await page.getByLabel("Session ID").fill("offline-edit");
  await expect(page.getByRole("status").filter({ hasText: /Offline|Unsaved/ })).toBeVisible({ timeout: 10_000 });
  await page.unroute("**/api/game/drafts");
  await saved(page);
  await page.reload(); await expect(page.getByLabel("Session ID")).toHaveValue("offline-edit");
  // a draft is not a score
  await expect(total(page)).toHaveText("0");
});

test("two devices on one team: no silent overwrite; the conflict can be resolved", async ({ page, browser }) => {
  await login(page, "P2-SHARE"); await page.goto("/play/inbox");
  const other = await secondDevice(browser, "P2-SHARE"); await other.page.goto("/play/inbox");
  await page.getByLabel("Capture ID").fill("FROM-DEVICE-ONE"); await saved(page);
  await other.page.getByLabel("Capture ID").fill("FROM-DEVICE-TWO");
  await expect(other.page.getByRole("alert").filter({ hasText: /changed on another device/ })).toBeVisible({ timeout: 15_000 });
  await page.reload(); await expect(page.getByLabel("Capture ID")).toHaveValue("FROM-DEVICE-ONE"); // device two did not overwrite
  await other.page.getByRole("button", { name: /Use the other device/ }).click();
  await expect(other.page.getByLabel("Capture ID")).toHaveValue("FROM-DEVICE-ONE");
  await other.page.getByLabel("Capture ID").fill("MERGED-VALUE"); await saved(other.page);
  await page.reload(); await expect(page.getByLabel("Capture ID")).toHaveValue("MERGED-VALUE");
  await page.getByLabel("Capture ID").fill("DEVICE-ONE-WINS-FIRST"); await saved(page);
  await other.page.getByLabel("Capture ID").fill("KEPT-MINE");
  await expect(other.page.getByRole("alert").filter({ hasText: /changed on another device/ })).toBeVisible({ timeout: 15_000 });
  await other.page.getByRole("button", { name: /Keep mine/ }).click(); await saved(other.page);
  await page.reload(); await expect(page.getByLabel("Capture ID")).toHaveValue("KEPT-MINE");
  await other.context.close();
});

test("unlocked chapters stay editable while earlier ones are unfinished; navigation by keyboard; completed chapters are read-only", async ({ page }) => {
  await login(page, "P2-MID-A");
  await page.goto("/play/containment");
  await expect(page.getByRole("heading", { level: 1, name: "Containment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit task" }).first()).toBeEnabled(); // editable although Inbox/Trail/Insider are unfinished
  const map = page.getByRole("navigation", { name: "Investigation map" });
  await expect(map.getByRole("link", { name: /Containment/ })).toHaveAttribute("aria-current", "page");
  await map.getByRole("link", { name: /Inbox/ }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "The Inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit task" }).first()).toBeDisabled(); // disabled only because fields are empty
  await page.getByRole("button", { name: "Log out" }).click();
  await login(page, "P2-DONE"); await page.goto("/play/inbox");
  await expect(page.getByText(/Chapter \d completed/)).toBeVisible();
  await expect(page.getByLabel("Capture ID")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Task complete|Submit task/ }).first()).toBeDisabled();
  await page.goto("/play/verdict"); await expect(page.getByText(/CASE CLOSED/i).first()).toBeVisible();
});

test("Insider: reachable by points, but the physical fragments still gate the dossier and scoring", async ({ page }) => {
  await login(page, "P2-SEALED"); await page.goto("/play/insider");
  await expect(page.getByText("Combine your two physical fragments")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit task" })).toHaveCount(0);
  await page.getByLabel("Fragment A").fill(frag("OTHER", "A")); await page.getByLabel("Fragment B").fill(frag("OTHER", "B"));
  await page.getByRole("button", { name: "Unlock dossier" }).click();
  await expect(page.getByText(/do not unlock/)).toBeVisible();
  await page.waitForTimeout(3200);
  await page.getByLabel("Fragment A").fill(frag("P2-SEALED", "A")); await page.getByLabel("Fragment B").fill(frag("P2-SEALED", "B"));
  await page.getByRole("button", { name: "Unlock dossier" }).click();
  await expect(page.getByRole("heading", { name: "The Evidence Wall" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Insider employee").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Submit task" }).first().click();
  await expect(page.getByText(/points|No new points/).first()).toBeVisible();
});

test("reduced motion removes transitions; phone layout keeps controls reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, "P2-MID-B"); await page.goto("/play/inbox");
  expect(await page.locator(".pg-gate-bar i").first().evaluate(el => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("navigation", { name: "Investigation map" }).getByRole("link", { name: /Trail/ })).toBeVisible();
});

test("after the deadline every chapter is read-only on the server and in the UI", async ({ page }) => {
  const url = process.env.DATABASE_URL!; expect(new URL(url).hostname).toBe("127.0.0.1"); expect(url).toMatch(/ghostt_/);
  await login(page, "P2-MID-C"); await page.goto("/play/containment");
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() - 1000) } });
    await page.reload();
    await expect(page.getByText(/Round finished/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Submit task" }).first()).toBeDisabled();
    const response = await page.request.post("/api/game", { headers: { origin: "http://127.0.0.1:3000" }, data: { action: "submit", chapter: 3, task: "containment.identity", answer: taskAnswer("containment.identity", "C") } });
    expect(await response.json()).toMatchObject({ error: "Round is not active" });
    const draft = await page.request.put("/api/game/drafts", { headers: { origin: "http://127.0.0.1:3000" }, data: { chapter: 3, taskId: "notes", data: { text: "x" }, baseVersion: 0 } });
    expect(draft.status()).toBe(403);
  } finally { await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() + 3_600_000) } }); await db.$disconnect(); }
});

test("Final Verdict can be solved task by task end to end (variant A)", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "P2-VERD-A"); await page.goto("/play/verdict");
  await expect(page.getByRole("heading", { level: 1, name: "Final Verdict" })).toBeVisible();
  const { solveVerdict } = await import("./fixtures/ui");
  await solveVerdict(page, "A");
  await expect(page.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE" })).toBeVisible({ timeout: 20_000 });
});
