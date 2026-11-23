import { expect, test, type Page } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { readFileSync } from "node:fs";
import { solveTrail, submitTask, logout, openTool, closeAllTools } from "./fixtures/ui";
import { trailAnswers, trailTamper } from "./fixtures/trail";

test.skip(!process.env.GHOST_E2E_TRAIL, "Run npm run test:e2e:trail for isolated Inbox and Trail regression fixtures");
async function login(page: Page, id: string) {
  await page.goto(id === "admin" ? "/organizer/login" : "/login");
  if (id !== "admin") await page.getByLabel("Team ID").fill(id);
  await page.getByLabel("Access code").fill(id === "admin" ? process.env.GHOST_E2E_ADMIN_CODE! : process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: id === "admin" ? "Event operations" : "Investigation dashboard", exact: true })).toBeVisible();
}

test("Trail page, JSON and CSV enforce sessions, progression and audited organizer overrides", async ({ page, browser }) => {
  expect((await page.request.get("/api/game/trail")).status()).toBe(401);
  expect((await page.request.get("/api/game/trail/csv")).status()).toBe(401);
  await page.goto("/play/trail"); await expect(page).toHaveURL(/\/login\?next=/);
  await login(page, "TRAIL-LOCKED");
  expect((await page.request.get("/api/game/trail?variant=B&teamId=TRAIL-B")).status()).toBe(403);
  expect((await page.request.get("/api/game/trail/csv")).status()).toBe(403);
  await page.goto("/play/trail"); await expect(page).toHaveURL(/\/play$/);
  const context = await browser.newContext(); const organizer = await context.newPage();
  await login(organizer, "admin");
  expect((await organizer.request.get("/api/game/trail")).status()).toBe(401);
  const override = organizer.locator("section").filter({ has: organizer.getByRole("heading", { name: "Unlock next chapter", exact: true }) });
  await override.getByLabel("Team ID").fill("TRAIL-LOCKED");
  await override.getByLabel("Reason").fill("Browser regression: authorized Inbox progression override");
  await override.getByRole("button", { name: "Record override" }).click(); await confirmDialog(organizer);
  await expect(organizer.locator("section").filter({ has: organizer.getByRole("heading", { name: "Recent audit events", exact: true }) }).getByText(/Browser regression: authorized Inbox progression override/)).toBeVisible();
  await page.goto("/play/trail"); await expect(page.getByRole("heading", { name: "Trail", exact: true })).toBeVisible();
  await expect(page.getByText("Saved score: 0 / 105", { exact: true })).toBeVisible();
  const own = await (await page.request.get("/api/game/trail?variant=C&teamId=TRAIL-C")).json();
  expect(own.caseId).toBe("NEXUS-TRAIL-A");
  await context.close();
});

for (const variant of ["A", "B", "C"] as const) test(`Trail ${variant}: filters, evidence, CSV, hints, global bonus and saved completion`, async ({ page }, testInfo) => {
  test.setTimeout(90000); // task-by-task submissions wait out the 3 s evidence cooldown; connection recovery spans two polling cycles.
  const answer = trailAnswers[variant];
  await login(page, `TRAIL-${variant}`);
  await page.getByRole("link", { name: "Open Chapter 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trail", exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/trailSolution|trailValidator|"positions"|"supportingEvidenceIds"/);
  const datasetResponse = await page.request.get(`/api/game/trail?variant=${variant === "A" ? "B" : "A"}&teamId=another-team`);
  expect(datasetResponse.headers()["cache-control"]).toBe("no-store");
  const dataset = await datasetResponse.json(); expect(dataset.caseId).toBe(`NEXUS-TRAIL-${variant}`); expect(dataset.rows).toHaveLength(144);
  const post = (body: unknown) => page.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action: "submit", chapter: 1, answer: body } });
  let externalSubmissionAt = 0;
  if (variant === "A") {
    await page.locator("summary", { hasText: "Tamper Alert" }).click();
    await expect(page.getByText("Global Tamper Alert bonus already recorded: +5.")).toBeVisible();
    expect(await (await post({ kind: "tamper", tamper: trailTamper(variant) })).json()).toMatchObject({ accepted: false, tamperAwarded: false, awarded: 0 });
    externalSubmissionAt = Date.now();
  }
  await openTool(page, "console");
  const table = page.getByRole("region", { name: "Authentication events" });
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Next page", exact: true }).click(); await expect(page.getByText("Page 2 of 6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous page", exact: true }).click();
  await page.getByRole("button", { name: "Sort newest first" }).click();
  expect(Date.parse((await table.locator("time").first().getAttribute("datetime"))!)).toBe(Math.max(...dataset.rows.map((row: { timestamp: string }) => Date.parse(row.timestamp))));
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("combobox", { name: "Filter by user", exact: true }).selectOption(answer.account);
  await page.getByRole("combobox", { name: "Filter by source IP", exact: true }).selectOption(answer.sourceIp);
  await page.getByRole("combobox", { name: "Filter by result", exact: true }).selectOption("success");
  await page.getByRole("combobox", { name: "Filter by event type", exact: true }).selectOption("session-validation");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: `Inspect ${answer.eventId}`, exact: true }).click();
  await page.getByRole("button", { name: "Use in my answer" }).click();
  await expect(page.getByLabel("Compromised account", { exact: true })).toHaveValue(answer.account);
  await page.getByRole("button", { name: "Filter to session" }).click();
  await expect(page.getByLabel("Filter by session", { exact: true })).toHaveValue(answer.sessionId);
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: `Inspect ${answer.supportingEvidenceIds[0]}`, exact: true }).click();
  await page.getByRole("button", { name: /Pin as evidence/ }).click();
  await openTool(page, "records");
  for (const id of answer.supportingEvidenceIds.slice(1)) await page.getByRole("button", { name: `Pin ${id}`, exact: true }).click();
  await page.getByRole("button", { name: "Close Case records" }).click(); // the records window floats over the console toolbar
  for (const id of answer.supportingEvidenceIds) await expect(page.getByLabel("Pinned evidence").getByText(id, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByLabel("Search records", { exact: true }).fill(trailTamper(variant).eventId);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: `Inspect ${trailTamper(variant).eventId}`, exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected event details" })).toContainText("UNTRUSTED CLIENT TEXT");
  await page.bringToFront();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.getByRole("complementary", { name: "Selected event details" }).getByRole("button", { name: "Copy ID", exact: true }).click();
  await expect(page.getByText(`Copied ${trailTamper(variant).eventId}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(trailTamper(variant).eventId);
  await closeAllTools(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV", exact: true }).click()]);
  const file = testInfo.outputPath(`trail-${variant}.csv`); await download.saveAs(file);
  const csv = readFileSync(file, "utf8"); expect(csv.split("\r\n")).toHaveLength(145); expect(csv).toContain('"\'=ANALYST_NOTE(');
  expect(csv).not.toMatch(/trailSolution|supportingEvidenceIds|answerKey/);
  await page.locator("summary", { hasText: "Hints" }).click();
  await page.getByRole("button", { name: /Reveal hint 1/ }).click();
  if (variant === "C") await page.getByRole("button", { name: /Reveal hint 2/ }).click();
  await expect(page.locator(".pg-hints ol li")).toHaveCount(variant === "C" ? 2 : 1);
  await page.reload(); await expect(page.locator(".pg-hints ol li")).toHaveCount(variant === "C" ? 2 : 1);
  if (variant === "C") await expect(page.getByRole("button", { name: "No hints left" })).toBeDisabled();
  if (variant !== "A") {
    await page.locator("summary", { hasText: "Tamper Alert" }).click();
    await page.getByLabel("Manipulation event ID", { exact: true }).fill(trailTamper(variant).eventId);
    await page.getByRole("combobox", { name: "Manipulation field", exact: true }).selectOption("details");
    await page.getByRole("combobox", { name: "Manipulation technique", exact: true }).selectOption("instruction-override");
    await page.getByRole("button", { name: "Record Tamper Alert" }).click();
    await expect(page.getByText("Global Tamper Alert bonus already recorded: +5.")).toBeVisible();
  }
  if (variant === "A") {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath("trail-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("trail-mobile.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    // The direct API probe above bypasses the hook's cooldown display.
    await expect.poll(() => Date.now() - externalSubmissionAt).toBeGreaterThanOrEqual(3000);
  }
  if (variant === "B") { // a wrong attacker IP earns the account points only, and rapid direct submissions are throttled
    await page.getByLabel("Compromised account", { exact: true }).fill(answer.account); await page.getByLabel("Attacker source IP", { exact: true }).fill("203.0.113.250");
    await submitTask(page, "Compromised account and source", /\+4 points\. Task 4\/8/);
    const throttled = await post(answer); expect(throttled.status()).toBe(429); expect(Number(throttled.headers()["retry-after"])).toBeGreaterThan(0);
    await page.getByLabel("Attacker source IP", { exact: true }).fill(answer.sourceIp);
    await submitTask(page, "Compromised account and source", /\+4 points\. Task 8\/8/);
  }
  await solveTrail(page, variant);
  const score = variant === "C" ? 36 : 42;
  await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Compromised account", { exact: true })).toBeDisabled();
  if (variant === "A") {
    await page.route("**/api/game", route => route.request().method() === "GET" ? route.abort() : route.continue());
    await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toBeVisible({ timeout: 10000 });
    await page.unroute("**/api/game"); await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toHaveCount(0, { timeout: 10000 });
  }
  await logout(page); await login(page, `TRAIL-${variant}`);
  await page.goto("/play/trail"); await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/game")).json(); expect(saved.current).toBe(2); expect(saved.progress.chapters[1].score).toBe(25); expect(saved.progress.bonus).toBe(5);
  await page.getByRole("navigation", { name: "Investigation map" }).getByRole("link", { name: /Inbox/ }).click();
  await expect(page.getByText("Chapter 1 completed. Chapter 2 unlocked.", { exact: true })).toBeVisible(); await expect(page.getByLabel("Capture ID")).toBeDisabled();
});

test("closed rounds keep Trail history readable and reject further mutation", async ({ page, browser }) => {
  await login(page, "TRAIL-C");
  const context = await browser.newContext(); const organizer = await context.newPage(); await login(organizer, "admin");
  await organizer.getByRole("button", { name: "Stop round", exact: true }).click(); await confirmDialog(organizer, "STOP");
  await expect(organizer.getByRole("button", { name: "Stop round", exact: true })).toBeDisabled();
  await page.goto("/play/trail"); await expect(page.getByRole("heading", { name: "Trail", exact: true })).toBeVisible();
  await expect(page.getByRole("timer", { name: "Round time remaining" })).toHaveText("FINISHED");
  for (const action of ["hint", "submit"]) {
    const response = await page.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action, chapter: 1, answer: trailAnswers.C } });
    expect(response.status()).toBe(409); expect((await response.json()).error).toContain("not active");
  }
  expect((await page.request.get("/api/game/trail/csv")).status()).toBe(200);
  await context.close();
});
