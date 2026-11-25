import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { insiderLogin as login } from "./fixtures/insider-browser";
import { arrange, solveContainment, submitTask, logout, phase } from "./fixtures/ui";
import { containmentAnswers } from "./fixtures/containment";

test.skip(!process.env.GHOST_E2E_CONTAINMENT, "Run npm run test:e2e:containment for isolated full-chapter fixtures");
test.describe.configure({ mode: "serial" });
let organizerCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
async function organizer(page: Page) {
  await page.context().addCookies(organizerCookies); await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Event operations", exact: true })).toBeVisible();
}

test("Containment enforces sessions, waiting round, exact team isolation and an audited Insider override", async ({ page, browser }) => {
  expect((await page.request.get("/api/game/containment")).status()).toBe(401);
  await page.goto("/play/containment"); await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto("/admin/containment-kit"); await expect(page).toHaveURL(/\/organizer\/login/);
  await login(page, "CONTAIN-A"); expect((await page.request.get("/api/game/containment")).status()).toBe(403);
  const post = await page.request.post("/api/game", { headers: { Origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` }, data: { action: "submit", chapter: 3, answer: containmentAnswers.A } }); expect(post.status()).toBe(409); expect((await post.json()).error).toContain("not active");
  await page.goto("/play/containment"); await expect(page).toHaveURL(/\/play$/); await expect(page.getByRole("timer", { name: "Round time remaining" })).toHaveText("WAITING");
  const context = await browser.newContext(), admin = await context.newPage(); await login(admin, "admin"); expect((await admin.request.get("/api/game/containment")).status()).toBe(401);
  await admin.getByRole("button", { name: "Start 60-minute round", exact: true }).click(); await confirmDialog(admin); await expect(admin.getByRole("button", { name: "Stop round", exact: true })).toBeEnabled();
  await logout(page); await login(page, "CONTAIN-LOCKED");
  expect((await page.request.get("/api/game/containment")).status()).toBe(403); expect((await page.request.get("/api/game/containment?teamId=CONTAIN-A")).status()).toBe(403);
  const override = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Unlock next chapter", exact: true }) }); await override.getByLabel("Team ID", { exact: true }).fill("CONTAIN-LOCKED"); await override.getByLabel("Reason", { exact: true }).fill("Containment browser regression: approved Insider progression override"); await override.getByRole("button", { name: "Record override", exact: true }).click(); await confirmDialog(admin);
  await expect(admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Recent audit events", exact: true }) }).getByText(/Containment browser regression: approved Insider progression override/)).toBeVisible(); await page.goto("/play/containment"); await expect(page.getByRole("heading", { name: "Containment", exact: true })).toBeVisible(); await expect(page.getByText("Saved score: 40 / 105", { exact: true })).toBeVisible();
  const own = await (await page.request.get("/api/game/containment")).json(); expect(own.evidence.caseId).toBe("NEXUS-CONTAINMENT-C"); expect(own.cctv.id).toBe("CCTV-C-08"); /* on screen, no grant */ expect(JSON.stringify(own)).not.toMatch(/fragmentA|fragmentB/);
  await page.goto("/admin/containment-kit"); await expect(page).toHaveURL(/\/organizer\/login/); organizerCookies = await context.cookies(); await context.close();
});

test("the CCTV kit is retired: organizer-only notice, no printable sheets, no copy authorization, no dashboard link", async ({ page }) => {
  await organizer(page); await expect(page.getByRole("link", { name: /Containment CCTV kit/ })).toHaveCount(0);
  await page.goto("/admin/containment-kit"); await expect(page.getByRole("heading", { name: "Containment CCTV kit: retired" })).toBeVisible(); await expect(page.locator(".containment-cctv")).toHaveCount(0);
  await expect(page.getByLabel("Copy authorization reason")).toHaveCount(0); await expect(page.getByRole("button", { name: "Authorize evidence copy" })).toHaveCount(0);
});

for (const variant of ["A", "B", "C"] as const) test(`Containment ${variant}: keyboard timeline, evidence, safe equivalent recovery, hints, score and saved history`, async ({ page }, info) => {
  test.setTimeout(90000);
  const answer = containmentAnswers[variant], id = `CONTAIN-${variant}`;
  const external: string[] = []; page.on("request", request => { if (new URL(request.url()).origin !== `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}`) external.push(request.url()); });
  await login(page, id); await page.getByRole("link", { name: "Open Chapter 4", exact: true }).click(); await expect(page.getByRole("heading", { name: "Containment", exact: true })).toBeVisible();
  expect(/containmentSolution|containmentValidator|"edges"|answerKey/.test(await page.content())).toBe(false);
  const response = await page.request.get("/api/game/containment"); expect(response.headers()["cache-control"]).toBe("no-store"); const data = await response.json(); expect(data.evidence.caseId).toBe(`NEXUS-CONTAINMENT-${variant}`); expect(data.evidence.events).toHaveLength(7);
  expect((await page.request.get("/api/game/containment?variant=A&teamId=CONTAIN-A")).status()).toBe(403);
  const mine = page.getByRole("article", { name: `Fictional snapshot CCTV-${variant}-08`, exact: true }); await expect(mine).toBeVisible(); // the security-room evidence is on screen for every variant, with no grant
  for (const other of ["A", "B", "C"].filter(v => v !== variant)) await expect(page.getByRole("article", { name: `Fictional snapshot CCTV-${other}-08`, exact: true })).toHaveCount(0); expect(data.cctv.id).toBe(`CCTV-${variant}-08`);
  await expect(page.locator("body")).not.toContainText(/evidence station|accessible copy|Check authorized CCTV copy|ask an organizer/i); await expect(page.getByRole("button", { name: "Check authorized CCTV copy" })).toHaveCount(0);
  const first = data.evidence.events[0].id;
  await page.getByRole("button", { name: `Move event ${first} down`, exact: true }).focus(); await page.keyboard.press("Space"); await expect(page.getByText(`${first} moved to position 2 of 7.`, { exact: true })).toBeVisible();
  await arrange(page, "event", answer.eventOrder);
  await phase(page, 5); await page.locator("summary", { hasText: "Read the records" }).click(); const drawer = page.locator("details").filter({ has: page.getByText(`${answer.supportingEvidenceIds[3]} · Response authority and business constraints`, { exact: true }) }).last(); await drawer.locator("summary").first().click(); await expect(drawer).toContainText("Support read-only service"); await expect(drawer).toContainText("parallel");
  await expect(page.getByText(/· observation$/, { exact: false }).filter({ hasText: `OBS-${variant}-` })).toHaveCount(2);
  const r = answer.recoveryOrder, safe = variant === "A" ? r : variant === "B" ? [r[1], r[0], r[2], ...r.slice(3)] : [r[1], r[2], r[0], ...r.slice(3)];
  await page.locator("summary", { hasText: "Hints" }).click(); await page.getByRole("button", { name: /Reveal hint 1/ }).click(); await expect(page.locator(".pg-hints ol li")).toHaveCount(1);
  if (variant === "C") { await page.getByRole("button", { name: /Reveal hint 2/ }).click(); await expect(page.locator(".pg-hints ol li")).toHaveCount(2); await expect(page.getByRole("button", { name: "No hints left" })).toBeDisabled(); }
  // One wrong task per variant: partial credit only, never a completed chapter; rapid direct submissions stay throttled.
  await phase(page, 1);
  if (variant === "A") { await page.getByRole("button", { name: `Move event ${answer.eventOrder[0]} down`, exact: true }).click(); await submitTask(page, "Incident timeline"); }
  if (variant === "B") { await phase(page, 2); await page.getByLabel("Affected account", { exact: true }).fill(answer.account); await page.getByLabel("Affected session", { exact: true }).fill(answer.sessionId); await submitTask(page, "Affected account and session", /\+2 points\. Task 2\/2/);
    await phase(page, 4); for (const action of r) await page.getByRole("checkbox", { name: `Select recovery ${action}`, exact: true }).setChecked(true); await arrange(page, "recovery", [r[4], ...safe.filter(id => id !== r[4])]); await submitTask(page, "Ordered recovery"); }
  if (variant === "C") { await phase(page, 2); await page.getByLabel("Affected account", { exact: true }).fill(answer.account); await page.getByLabel("Affected session", { exact: true }).fill("nx-c-managed"); await submitTask(page, "Affected account and session", /\+1 points\. Task 1\/2/); }
  const probe = await page.request.post("/api/game", { headers: { Origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` }, data: { action: "submit", chapter: 3, answer } }); expect(probe.status()).toBe(429); expect(Number(probe.headers()["retry-after"])).toBeGreaterThan(0);
  await expect(page.getByText("Chapter 4 completed. Chapter 5 unlocked.", { exact: true })).toHaveCount(0);
  expect((await (await page.request.get("/api/game")).json()).current).toBe(3);
  await solveContainment(page, variant, safe);
  if (variant === "A") {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: info.outputPath("containment-desktop.png"), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("containment-mobile.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route("**/api/game", route => route.request().method() === "GET" ? route.abort() : route.continue()); await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toBeVisible({ timeout: 10000 }); await page.unroute("**/api/game"); await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toHaveCount(0, { timeout: 10000 });
  }
  await expect(page.getByText("Chapter 4 completed. Chapter 5 unlocked.", { exact: true })).toBeVisible();
  const score = variant === "A" ? 87 : variant === "B" ? 82 : 76; await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator(".pg-hints ol li")).toHaveCount(variant === "C" ? 2 : 1); await phase(page, 2); await expect(page.getByLabel("Affected account", { exact: true })).toBeDisabled();
  await logout(page); await login(page, id); await expect(page.locator(".gd-stage[aria-current=step]").getByRole("heading", { name: "Final Verdict", exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/game")).json(); expect(saved.current).toBe(4); expect(saved.score).toBe(score); expect(saved.progress.chapters[3].score).toBe(20); expect(saved.progress.bonus).toBe(variant === "A" ? 5 : 0);
  await page.goto("/play/containment"); await expect(page.getByText("Chapter 4 completed. Chapter 5 unlocked.", { exact: true })).toBeVisible(); expect(external).toEqual([]);
  await page.getByRole("link", { name: /^Open Chapter 5/ }).first().click(); await expect(page.getByRole("heading", { name: "Final Verdict", exact: true })).toBeVisible(); expect((await page.request.get("/api/game/verdict")).status()).toBe(200);
});

test("closed rounds preserve authorized historical evidence and block new plans and hints", async ({ page, browser }) => {
  const context = await browser.newContext(), admin = await context.newPage(); await organizer(admin); await admin.getByRole("button", { name: "Stop round", exact: true }).click(); await confirmDialog(admin, "STOP"); await expect(admin.getByRole("button", { name: "Stop round", exact: true })).toBeDisabled();
  await login(page, "CONTAIN-A"); await page.goto("/play/containment"); await expect(page.getByRole("timer", { name: "Round time remaining" })).toHaveText("FINISHED"); await expect(page.getByRole("article", { name: "Fictional snapshot CCTV-A-08", exact: true })).toBeVisible();
  for (const action of ["hint", "submit"]) { const response = await page.request.post("/api/game", { headers: { Origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` }, data: { action, chapter: 3, answer: containmentAnswers.A } }); expect(response.status()).toBe(409); expect((await response.json()).error).toContain("not active"); }
  expect((await page.request.get("/api/game/containment")).status()).toBe(200); await context.close();
});
