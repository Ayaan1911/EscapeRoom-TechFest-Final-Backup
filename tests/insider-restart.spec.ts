import { expect, test } from "@playwright/test";
import { insiderLogin, printedPairs, readCards } from "./fixtures/insider-browser";

test.skip(!process.env.GHOST_E2E_INSIDER, "Run npm run test:e2e:insider for a separate restarted server against the same disposable DB");
test("a new server process retains physical unlock, completion, hints and all 50 printable pairs", async ({ page }) => {
  await insiderLogin(page, "INSIDER-01"); await page.goto("/play/insider");
  await expect(page.getByRole("heading", { name: "The Evidence Wall", exact: true })).toBeVisible(); await expect(page.getByLabel("Fragment A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Saved score: 67 / 105", { exact: true })).toBeVisible(); await expect(page.locator(".pg-hints ol li")).toHaveCount(1);
  await expect(page.getByText("Chapter 3 completed. Chapter 4 unlocked.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); await insiderLogin(page, "admin");
  const pairs = printedPairs();
  for (const part of ["A", "B"] as const) { const query = new URLSearchParams({ part, scope: "selected" }); for (const card of pairs[part]) query.append("teamIds", card.teamId); await page.goto(`/admin/insider-kit?${query}`); expect(await readCards(page)).toEqual(pairs[part]); }
});
