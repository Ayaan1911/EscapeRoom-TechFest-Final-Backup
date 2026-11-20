import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { insiderLogin as login } from "./fixtures/insider-browser";
import { logout } from "./fixtures/ui";

test.skip(!process.env.GHOST_E2E_VERDICT, "Run npm run test:e2e:verdict to verify completion against a new server process");
test("a new server preserves 105-point closure, completion time, permitted history and final organizer review", async ({ page }) => {
  const expected = JSON.parse(readFileSync("test-results/verdict-main/completions.json", "utf8")); await login(page, "VERDICT-A"); await expect(page.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible(); await expect(page.locator(".case-closed")).toContainText("105 / 105"); await expect(page.locator(".case-closed")).toContainText(new Date(expected.A.completedAt).toISOString());
  const state = await (await page.request.get("/api/game")).json(); expect(state.current).toBe(-1); expect(state.progress.completedAt).toBe(expected.A.completedAt); expect(state.insiderUnlocked).toBe(true);
  for (const [route, title] of [["inbox", "The Inbox"], ["trail", "Trail"], ["insider", "Insider"], ["containment", "Containment"], ["verdict", "Final Verdict"]]) { await page.goto(`/play/${route}`); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible(); }
  await logout(page); await login(page, "admin"); await expect(page.getByRole("status").filter({ hasText: /^FINAL \/ ORGANIZER CONFIRMED$/ })).toBeVisible(); await expect(page.getByRole("button", { name: "Record qualification confirmation", exact: true })).toBeDisabled(); const csv = await (await page.request.get("/api/admin/scores")).text(); expect(csv).toContain("FINAL / ORGANIZER CONFIRMED"); expect(csv).toContain(new Date(expected.A.completedAt).toISOString());
});

test("a valid finished team session never shows 'Session expired', even across polling and an organizer login in the same profile", async ({ browser }) => {
  const context = await browser.newContext(), team = await context.newPage(), admin = await context.newPage();
  await login(team, "VERDICT-A");
  await expect(team.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible();
  await login(admin, "admin"); // formerly replaced the shared cookie and logged the team out
  await team.waitForTimeout(11_000); // two 5-second polling cycles
  await expect(team.getByText(/Session expired/)).toHaveCount(0);
  await expect(team.getByRole("alert").filter({ hasText: /expired|Sign in/ })).toHaveCount(0);
  await expect(team.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible();
  expect((await team.request.get("/api/game")).status()).toBe(200);
  await context.close();
});
