import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { inboxAnswers } from "./fixtures/inbox";

test.skip(!process.env.GHOST_E2E_INBOX, "Run npm run test:e2e:inbox to use isolated temporary fixtures");
async function login(page: Page, variant: string | "admin") {
  await page.goto(variant === "admin" ? "/login?role=admin" : "/login");
  if (variant !== "admin") await page.getByLabel("Team ID").fill(`DEMO-${variant}`);
  await page.getByLabel("Access code").fill(variant === "admin" ? process.env.GHOST_E2E_ADMIN_CODE! : process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: variant === "admin" ? "Event operations" : "Investigation dashboard", exact: true })).toBeVisible();
}

test("organizer starts a waiting round and prints a scannable phone QR", async ({ page, browser }) => {
  await page.goto("/clue/inbox");
  await expect(page).toHaveURL(/\/login\?next=/);
  await login(page, "C");
  await page.goto("/play/inbox");
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { name: "Awaiting organizer start" })).toBeVisible();
  await page.goto("/clue/inbox");
  await expect(page).toHaveURL(/\/play$/);
  const context = await browser.newContext();
  const organizer = await context.newPage();
  await login(organizer, "admin");
  await organizer.getByRole("link", { name: "Print Chapter 1 evidence kit" }).click();
  await expect(organizer.locator("main").getByRole("alert")).toContainText("Loopback");
  await organizer.getByLabel("Application origin").fill("https://event.nexus.example");
  await organizer.getByRole("button", { name: "Generate printable QR" }).click();
  const image = organizer.getByAltText("Chapter 1 forensic snapshot QR code");
  await expect(image).toBeVisible();
  const pixels = await image.evaluate(async node => {
    const image = node as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return { data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data), width: canvas.width, height: canvas.height };
  });
  expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toBe("https://event.nexus.example/clue/inbox");
  await organizer.goto("/admin");
  await organizer.getByRole("button", { name: "Start 60-minute round" }).click();
  await expect(organizer.getByRole("button", { name: "Stop round" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Open Chapter 1" })).toBeVisible({ timeout: 10000 });
  const scanningContext = await browser.newContext();
  const scanningPhone = await scanningContext.newPage();
  await scanningPhone.goto("/clue/inbox?variant=A");
  await expect(scanningPhone.getByRole("heading", { name: "Team login" })).toBeVisible();
  await scanningPhone.getByLabel("Team ID").fill("DEMO-C");
  await scanningPhone.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await scanningPhone.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(scanningPhone.getByRole("heading", { name: "Captured authentication page" })).toBeVisible();
  await expect(scanningPhone.locator("body")).toContainText("CAP-C-17");
  await scanningContext.close();
  await context.close();
});

for (const variant of ["A", "B", "C"] as const) test(`team ${variant} investigates, persists hints and bonus, and unlocks Chapter 2`, async ({ page, browser }, testInfo) => {
  if (variant === "A") test.setTimeout(60000); // Recovery below spans two five-second polling cycles.
  await login(page, variant);
  await page.getByRole("link", { name: "Open Chapter 1" }).click();
  await expect(page.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/inboxSolution|inboxValidator|"answerKey"|"requiredEvidence"/);
  await expect(page.getByRole("complementary", { name: "Recovered emails" }).getByRole("button")).toHaveCount(6);
  await page.getByRole("button").filter({ hasText: `MAIL-${variant}-05` }).click();
  await expect(page.getByRole("article", { name: "Selected email" })).toContainText("ATTACKER-CONTROLLED");
  await expect(page.getByRole("article", { name: "Selected email" }).locator('a[href^="https:"]')).toHaveCount(0);
  const [snapshot] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Open QR forensic snapshot" }).click()]);
  await expect(snapshot.getByRole("heading", { name: "Captured authentication page" })).toBeVisible();
  await expect(snapshot.locator("body")).toContainText(`CAP-${variant}-17`);
  await expect(snapshot.locator("input, form, iframe")).toHaveCount(0);
  await expect(snapshot.locator('a[href^="https:"]')).toHaveCount(0);
  await snapshot.goto(`/clue/inbox?variant=${variant === "A" ? "B" : "A"}`);
  await expect(snapshot.locator("body")).toContainText(`CAP-${variant}-17`);
  await snapshot.close();
  await page.getByRole("button", { name: "Request hint 1" }).click();
  await expect(page.locator(".released-hints li")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".released-hints li")).toHaveCount(1);
  await page.getByLabel("Manipulation email").selectOption(`MAIL-${variant}-05`);
  await page.getByLabel("Manipulation artifact").selectOption(`ATT-${variant}-05`);
  await page.getByLabel("Manipulation technique").selectOption("instruction-override");
  await page.getByRole("button", { name: "Record Tamper Alert" }).click();
  await expect(page.getByText("Tamper Alert bonus already recorded: +5.")).toBeVisible();
  const answer = inboxAnswers[variant];
  await page.getByLabel("Initial compromise email").selectOption(answer.emailId);
  await page.getByLabel("Delivery / navigation evidence").selectOption(answer.deliveryId);
  await page.getByLabel("Snapshot evidence ID").fill(answer.snapshotId);
  await page.getByLabel("Authentication evidence").selectOption(answer.authenticationId);
  await page.getByLabel("Database export evidence").selectOption(answer.databaseId);
  await page.getByLabel("Correlated session ID").fill(answer.sessionId);
  await page.getByLabel("Short explanation").fill("Recorded redirect, capture, sign-in session and unauthorized export agree.");
  await expect(page.getByRole("button", { name: "Submit conclusion" })).toBeEnabled({ timeout: 6000 });
  if (variant === "A") {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("inbox-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("inbox-desktop.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Submit conclusion" }).click();
  await expect(page.getByText("Chapter 1 completed. Chapter 2 unlocked.", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved score: 17 / 105", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Saved score: 17 / 105", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit conclusion" })).toBeDisabled();
  if (variant === "A") {
    await page.route("**/api/game", route => route.request().method() === "GET" ? route.abort() : route.continue());
    await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toBeVisible({ timeout: 10000 });
    await page.unroute("**/api/game");
    await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText("Saved score: 17 / 105", { exact: true })).toBeVisible();
  }
  await page.goto("/admin/inbox-kit");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
  await page.goto("/play/inbox");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await login(page, variant);
  await page.goto("/play/inbox");
  await expect(page.getByText("Saved score: 17 / 105", { exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/game")).json();
  expect(saved.current).toBe(1); expect(saved.progress.bonus).toBe(5); expect(saved.chapterHints[0]).toHaveLength(1);
  expect(saved).not.toHaveProperty("answerKey");
  const reopened = await browser.newContext({ storageState: await page.context().storageState() });
  const restored = await reopened.newPage(); await restored.goto("/play/inbox");
  await expect(restored.getByText("Saved score: 17 / 105", { exact: true })).toBeVisible();
  await reopened.close();
});
