import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { insiderLogin as login } from "./fixtures/insider-browser";

test.skip(!process.env.GHOST_E2E_VERDICT, "Run npm run test:e2e:verdict to verify completion against a new server process");
test("a new server preserves 105-point closure, completion time, permitted history and final organizer review", async ({ page }) => {
  const expected = JSON.parse(readFileSync("test-results/verdict-main/completions.json", "utf8")); await login(page, "VERDICT-A"); await expect(page.getByRole("heading", { name: "CASE CLOSED — INVESTIGATION COMPLETE", exact: true })).toBeVisible(); await expect(page.locator(".case-closed")).toContainText("105 / 105"); await expect(page.locator(".case-closed")).toContainText(new Date(expected.A.completedAt).toISOString());
  const state = await (await page.request.get("/api/game")).json(); expect(state.current).toBe(-1); expect(state.progress.completedAt).toBe(expected.A.completedAt); expect(state.insiderUnlocked).toBe(true);
  for (const [route, title] of [["inbox", "The Inbox"], ["trail", "Trail"], ["insider", "Insider"], ["containment", "Containment"], ["verdict", "Final Verdict"]]) { await page.goto(`/play/${route}`); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible(); }
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await login(page, "admin"); await expect(page.getByRole("status").filter({ hasText: /^FINAL \/ ORGANIZER CONFIRMED$/ })).toBeVisible(); await expect(page.getByRole("button", { name: "Record qualification confirmation", exact: true })).toBeDisabled(); const csv = await (await page.request.get("/api/admin/scores")).text(); expect(csv).toContain("FINAL / ORGANIZER CONFIRMED"); expect(csv).toContain(new Date(expected.A.completedAt).toISOString());
});
