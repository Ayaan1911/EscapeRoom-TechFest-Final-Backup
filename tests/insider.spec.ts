import { expect, test } from "@playwright/test";
import { confirmDialog } from "./fixtures/admin-confirm";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { solveInsider, submitTask, logout, openTool, closeAllTools } from "./fixtures/ui";
import { insiderAnswers } from "./fixtures/insider";
import { insiderLogin, manifestPath, printedPairs, readCards } from "./fixtures/insider-browser";

test.skip(!process.env.GHOST_E2E_INSIDER, "Run npm run test:e2e:insider for isolated physical/digital fixtures");
test.describe.configure({ mode: "serial" });

test("organizer prepares separate A/B A4 sheets for 50 teams, stable reprints and a single missing card", async ({ page }, info) => {
  test.setTimeout(60000);
  await insiderLogin(page, "admin");
  const ids = Array.from({ length: 50 }, (_, i) => `INSIDER-${String(i + 1).padStart(2, "0")}`);
  await page.goto("/admin/insider-kit");
  await expect(page.locator(".fragment-card")).toHaveCount(0);
  for (const id of ids) await page.getByRole("checkbox", { name: new RegExp(`^${id} `) }).check();
  await page.getByRole("button", { name: "Prepare selected teams", exact: true }).click();
  await expect(page).toHaveURL(/part=A.*scope=selected/);
  const A = await readCards(page); expect(A).toHaveLength(50); expect(new Set(A.map(card => card.fragment)).size).toBe(50);
  expect(/\bB-(?:[A-F\d]{6}-){3}[A-F\d]{6}\b/.test(await page.content())).toBe(false);
  await page.pdf({ path: info.outputPath("private-A-50.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.getByRole("combobox", { name: "Sheet type", exact: true }).selectOption("B");
  await page.getByRole("button", { name: "Prepare selected teams", exact: true }).click();
  await expect(page).toHaveURL(/part=B.*scope=selected/);
  const B = await readCards(page); expect(B).toHaveLength(50); expect(new Set(B.map(card => card.fragment)).size).toBe(50);
  for (const a of A) { expect(a.fragment.startsWith("A-")).toBe(true); expect(B.find(b => b.teamId === a.teamId)?.station).toBe(a.station); expect(await page.content()).not.toContain(a.fragment); }
  expect(new Set(B.map(card => card.station)).size).toBe(5);
  await page.pdf({ path: info.outputPath("public-B-50.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.reload(); expect(await readCards(page)).toEqual(B);
  await page.goto(`/admin/insider-kit?part=B&scope=selected&teamIds=${B[0].teamId}`);
  expect(await readCards(page)).toEqual([B[0]]);
  await page.pdf({ path: info.outputPath("public-B-single.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.goto("/admin/insider-kit?part=A&scope=selected&teamIds=UNREGISTERED");
  await expect(page.locator(".fragment-card")).toHaveCount(0);
  await page.goto("/admin/insider-kit?part=B&scope=all"); expect((await readCards(page)).length).toBeGreaterThan(50);
  mkdirSync(dirname(manifestPath), { recursive: true }); writeFileSync(manifestPath, JSON.stringify({ A, B }));
});

test("anonymous, organizer and premature participant requests cannot reveal a dossier or print private slips", async ({ page }) => {
  expect((await page.request.get("/api/game/insider")).status()).toBe(401);
  await page.goto("/play/insider"); await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto("/admin/insider-kit?part=A&scope=all"); await expect(page).toHaveURL(/\/organizer\/login/);
  await insiderLogin(page, "admin"); expect((await page.request.get("/api/game/insider")).status()).toBe(401);
  await logout(page);
  await insiderLogin(page, "INSIDER-LOCKED");
  expect((await page.request.get("/api/game/insider?teamId=INSIDER-01&variant=A")).status()).toBe(403);
  await page.goto("/play/insider"); await expect(page).toHaveURL(/\/play$/);
  const premature = await page.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action: "unlock", chapter: 2, answer: { fragmentA: printedPairs().A[0].fragment, fragmentB: printedPairs().B[0].fragment } } });
  expect(premature.status()).toBe(409); expect((await premature.json()).error).toContain("locked");
  await page.goto("/admin/insider-kit?part=A&scope=all"); await expect(page).toHaveURL(/\/organizer\/login/); await expect(page.locator(".fragment-card")).toHaveCount(0);
});

for (const [index, variant] of (["A", "B", "C"] as const).entries()) test(`Insider ${variant}: physical unlock, investigation, hints, conclusion and saved recovery`, async ({ page }, info) => {
  test.setTimeout(60000);
  const id = `INSIDER-0${index + 1}`, answer = insiderAnswers[variant], pairs = printedPairs();
  const a = pairs.A.find(card => card.teamId === id)!.fragment, b = pairs.B.find(card => card.teamId === id)!.fragment;
  await insiderLogin(page, id); await page.getByRole("link", { name: "Open Chapter 3", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Combine your two physical fragments", exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/EMP-[ABC]-0\d|UPDATE existing-session-export-policy|insiderSolution|supportingEvidenceIds/);
  expect(await page.content()).not.toContain(a); expect(await page.content()).not.toContain(b);
  const sealed = await page.request.get("/api/game/insider?teamId=INSIDER-50&variant=Z"); expect(sealed.headers()["cache-control"]).toBe("no-store"); expect(await sealed.json()).toEqual({ unlocked: false, dossier: null });
  const post = (action: string, data: unknown) => page.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action, chapter: 2, answer: data } });
  const early = await post("submit", answer); expect(early.status()).toBe(409); expect((await early.json()).error).toContain("Unlock");
  await page.locator("summary", { hasText: "Hints" }).click();
  await page.getByRole("button", { name: /Reveal hint 1/ }).click();
  await expect(page.locator(".pg-hints ol li")).toHaveCount(1);
  if (variant === "C") { await page.getByRole("button", { name: /Reveal hint 2/ }).click(); await expect(page.locator(".pg-hints ol li")).toHaveCount(2); }
  // The direct premature request above bypasses the hook's client countdown.
  await expect.poll(async () => (await post("unlock", { fragmentA: a, fragmentB: "B-000000-000000-000000-000000" })).status(), { intervals: [1000], timeout: 6000 }).toBe(200);
  const rejectedAt = Date.now();
  const throttle = await post("unlock", { fragmentA: a, fragmentB: b }); expect(throttle.status()).toBe(429); expect(Number(throttle.headers()["retry-after"])).toBeGreaterThan(0);
  await page.reload();
  await page.getByLabel("Fragment A", { exact: true }).fill(a);
  await page.getByLabel("Fragment B", { exact: true }).fill(pairs.B.find(card => card.teamId === (variant === "A" ? "INSIDER-04" : "INSIDER-01"))!.fragment);
  await expect.poll(() => Date.now() - rejectedAt, { timeout: 6000 }).toBeGreaterThanOrEqual(3000);
  await page.getByRole("button", { name: "Unlock dossier", exact: true }).click();
  await expect(page.getByText(/These fragments do not unlock this dossier/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Evidence Wall", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unlock dossier", exact: true })).toBeEnabled({ timeout: 6000 });
  await page.getByLabel("Fragment A", { exact: true }).fill(a); await page.getByLabel("Fragment B", { exact: true }).fill(b);
  await page.getByRole("button", { name: "Unlock dossier", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible();
  const revealed = await (await page.request.get("/api/game/insider?variant=Z&teamId=another")).json(); expect(revealed.dossier.caseId).toBe(`NEXUS-INSIDER-${variant}`); expect(JSON.stringify(revealed)).not.toContain(a); expect(JSON.stringify(revealed)).not.toContain(b);
  await page.reload(); await expect(page.getByLabel("Fragment A", { exact: true })).toHaveCount(0);
  await logout(page); await insiderLogin(page, id); await page.goto("/play/insider");
  await expect(page.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible();
  await expect(page.locator(".pg-hints ol li")).toHaveCount(variant === "C" ? 2 : 1);
  await expect(page.locator(".os-dock")).toBeVisible(); // the dock mounts after hydration: selecting earlier would be reset by React
  await page.getByRole("combobox", { name: "Suspect profile", exact: true }).selectOption(answer.employeeId); await expect(page.locator(".suspect-profile")).toContainText(answer.employeeId);
  await page.getByRole("combobox", { name: "Record type", exact: true }).selectOption("policy"); await expect(page.getByText("2 of 26 records", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset dossier filters", exact: true }).click();
  await openTool(page, "dossier");
  for (const evidenceId of answer.supportingEvidenceIds) {
    await page.getByLabel("Search dossier", { exact: true }).fill(evidenceId);
    await page.getByRole("region", { name: "Dossier records", exact: true }).getByRole("button").first().click();
    await expect(page.getByRole("article", { name: "Evidence detail", exact: true })).toContainText(evidenceId);
    await page.getByRole("button", { name: /^☆ Pin evidence ID/ }).click();
  }
  await page.bringToFront(); await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.getByRole("button", { name: "Copy ID", exact: true }).click();
  await expect(page.getByText(`Copied ${answer.supportingEvidenceIds[2]}`, { exact: true })).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(answer.supportingEvidenceIds[2]);
  await expect(page.getByRole("button", { name: /^Unpin / })).toHaveCount(3);
  await closeAllTools(page);
  if (variant === "B") { // wrong insider earns nothing for that task; direct rapid submissions are throttled
    await page.getByRole("combobox", { name: "Insider employee", exact: true }).selectOption(`EMP-${variant}-01`);
    await submitTask(page, "Insider identified", /No points yet/);
    expect((await post("submit", answer)).status()).toBe(429);
  }
  if (variant === "A") {
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: info.outputPath("insider-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("insider-mobile.png"), fullPage: true }); await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await solveInsider(page, variant);
  await expect(page.getByText("Chapter 3 completed. Chapter 4 unlocked.", { exact: true })).toBeVisible();
  const score = variant === "A" ? 67 : variant === "B" ? 62 : 56;
  await expect(page.getByText(`Saved score: ${score} / 105`, { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("combobox", { name: "Insider employee", exact: true })).toBeDisabled();
  await logout(page); await insiderLogin(page, id);
  const state = await (await page.request.get("/api/game")).json(); expect(state.current).toBe(3); expect(state.insiderUnlocked).toBe(true); expect(state.score).toBe(score); expect(state.progress.chapters[2].score).toBe(25); expect(state.progress.bonus).toBe(variant === "A" ? 5 : 0);
  await expect(page.locator(".gd-stage[aria-current=step]").getByRole("heading", { name: "Containment", exact: true })).toBeVisible();
  for (const route of ["inbox", "trail"]) { await page.goto(`/play/${route}`); expect((await page.request.get("/api/game/insider")).status()).toBe(200); await expect(page.getByRole("heading", { name: route === "inbox" ? "The Inbox" : "Trail", exact: true })).toBeVisible(); }
  await page.goto("/play/containment"); await expect(page.getByRole("heading", { name: "Containment", exact: true })).toBeVisible(); expect((await page.request.get("/api/game/containment")).status()).toBe(200);
});

test("closed rounds retain unlocked history and block sealed-team unlock, hints and conclusions", async ({ page, browser }) => {
  const context = await browser.newContext(), admin = await context.newPage(); await insiderLogin(admin, "admin");
  await admin.getByRole("button", { name: "Stop round", exact: true }).click(); await confirmDialog(admin, "STOP"); await expect(admin.getByRole("button", { name: "Stop round", exact: true })).toBeDisabled();
  await insiderLogin(page, "INSIDER-01"); await page.goto("/play/insider"); await expect(page.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible(); await expect(page.getByRole("timer", { name: "Round time remaining" })).toHaveText("FINISHED");
  await logout(page); await insiderLogin(page, "INSIDER-04");
  await page.goto("/play/insider"); await expect(page.getByRole("button", { name: "Unlock dossier", exact: true })).toBeDisabled();
  const pairs = printedPairs(), fragments = { fragmentA: pairs.A.find(card => card.teamId === "INSIDER-04")!.fragment, fragmentB: pairs.B.find(card => card.teamId === "INSIDER-04")!.fragment };
  for (const action of ["unlock", "hint", "submit"]) { const response = await page.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action, chapter: 2, answer: action === "unlock" ? fragments : insiderAnswers.A } }); expect(response.status()).toBe(409); expect((await response.json()).error).toContain("not active"); }
  expect(await (await page.request.get("/api/game/insider")).json()).toEqual({ unlocked: false, dossier: null }); await context.close();
});
