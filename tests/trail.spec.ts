import { expect, test, type Page } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { readFileSync } from "node:fs";
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
  if (variant === "A") test.setTimeout(60000); // Connection recovery spans two five-second polling cycles.
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
    await expect(page.getByText("Global Tamper Alert bonus already recorded: +5.")).toBeVisible();
    expect(await (await post({ kind: "tamper", tamper: trailTamper(variant) })).json()).toEqual({ accepted: false, tamperAwarded: false });
    externalSubmissionAt = Date.now();
  }
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
  await page.getByRole("button", { name: "Use event in conclusion" }).click();
  await expect(page.getByLabel("Compromised account", { exact: true })).toHaveValue(answer.account);
  await page.getByRole("button", { name: "View related session events" }).click();
  await expect(page.getByLabel("Filter by session", { exact: true })).toHaveValue(answer.sessionId);
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: `Inspect ${answer.supportingEvidenceIds[0]}`, exact: true }).click();
  await page.getByRole("button", { name: "Add event as evidence" }).click();
  for (const id of answer.supportingEvidenceIds.slice(1)) await page.getByRole("button", { name: `Add evidence ${id}`, exact: true }).click();
  await expect(page.getByLabel("Supporting evidence IDs (exactly three)", { exact: true })).toHaveValue(answer.supportingEvidenceIds.join(", "));
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByLabel("Search records", { exact: true }).fill(trailTamper(variant).eventId);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: `Inspect ${trailTamper(variant).eventId}`, exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selected event details" })).toContainText("UNTRUSTED CLIENT TEXT");
  await page.bringToFront();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.getByRole("button", { name: "Copy event ID", exact: true }).click();
  await expect(page.getByText(`Evidence ID copied: ${trailTamper(variant).eventId}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(trailTamper(variant).eventId);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download login CSV", exact: true }).click()]);
  const file = testInfo.outputPath(`trail-${variant}.csv`); await download.saveAs(file);
  const csv = readFileSync(file, "utf8"); expect(csv.split("\r\n")).toHaveLength(145); expect(csv).toContain('"\'=ANALYST_NOTE(');
  expect(csv).not.toMatch(/trailSolution|supportingEvidenceIds|answerKey/);
  await page.getByRole("button", { name: "Request Trail hint 1" }).click();
  if (variant === "C") await page.getByRole("button", { name: "Request Trail hint 2" }).click();
  await expect(page.locator(".released-hints li")).toHaveCount(variant === "C" ? 2 : 1);
  await page.reload(); await expect(page.locator(".released-hints li")).toHaveCount(variant === "C" ? 2 : 1);
  if (variant === "C") await expect(page.getByRole("button", { name: "Request Trail hint 2" })).toBeDisabled();
  if (variant !== "A") {
    await page.getByLabel("Manipulation event ID", { exact: true }).fill(trailTamper(variant).eventId);
    await page.getByRole("combobox", { name: "Manipulation field", exact: true }).selectOption("details");
    await page.getByRole("combobox", { name: "Manipulation technique", exact: true }).selectOption("instruction-override");
    await page.getByRole("button", { name: "Record Trail Tamper Alert" }).click();
    await expect(page.getByText("Global Tamper Alert bonus already recorded: +5.")).toBeVisible();
  }
  await page.getByLabel("Compromised account", { exact: true }).fill(answer.account);
  await page.getByLabel("Attacker source IP", { exact: true }).fill(variant === "B" ? "203.0.113.250" : answer.sourceIp);
  await page.getByLabel("Incident session ID", { exact: true }).fill(answer.sessionId);
  await page.getByLabel("Relevant authentication event ID", { exact: true }).fill(answer.eventId);
  await page.getByLabel("Supporting evidence IDs (exactly three)", { exact: true }).fill(answer.supportingEvidenceIds.join(", "));
  await page.getByLabel("Short explanation (optional)", { exact: true }).fill("Original session issuance, changed device/source, retained redirect and export agree.");
  await expect(page.getByRole("button", { name: "Submit Trail conclusion", exact: true })).toBeEnabled({ timeout: 6000 });
  if (variant === "B") {
    await page.getByRole("button", { name: "Submit Trail conclusion", exact: true }).click();
    await expect(page.getByText(/Evidence does not support this submission/)).toBeVisible();
    const throttled = await post(answer); expect(throttled.status()).toBe(429); expect(Number(throttled.headers()["retry-after"])).toBeGreaterThan(0);
    await page.getByLabel("Attacker source IP", { exact: true }).fill(answer.sourceIp);
  }
  if (variant === "A") {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath("trail-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("trail-mobile.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    // The direct API probe above bypasses the hook's cooldown display.
    await expect.poll(() => Date.now() - externalSubmissionAt).toBeGreaterThanOrEqual(3000);
  }
  await page.getByRole("button", { name: "Submit Trail conclusion", exact: true }).click();
  await expect(page.getByText("Chapter 2 completed. Chapter 3 unlocked.", { exact: true })).toBeVisible();
  const score = variant === "C" ? 36 : 42;
  await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Submit Trail conclusion", exact: true })).toBeDisabled();
  if (variant === "A") {
    await page.route("**/api/game", route => route.request().method() === "GET" ? route.abort() : route.continue());
    await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toBeVisible({ timeout: 10000 });
    await page.unroute("**/api/game"); await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toHaveCount(0, { timeout: 10000 });
  }
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await login(page, `TRAIL-${variant}`);
  await page.goto("/play/trail"); await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/game")).json(); expect(saved.current).toBe(2); expect(saved.progress.chapters[1].score).toBe(25); expect(saved.progress.bonus).toBe(5);
  await page.getByRole("link", { name: "Review Inbox evidence", exact: true }).click();
  await expect(page.getByText("Chapter 1 completed. Chapter 2 unlocked.", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Submit conclusion", exact: true })).toBeDisabled();
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
