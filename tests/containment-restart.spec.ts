import { expect, test } from "@playwright/test";
import { insiderLogin as login } from "./fixtures/insider-browser";

test.skip(!process.env.GHOST_E2E_CONTAINMENT, "Run npm run test:e2e:containment for an independent restarted server");
test("a new server retains Containment score, hints, Final Verdict progression and the audited accessible clue", async ({ page }) => {
  await login(page, "CONTAIN-A"); await page.goto("/play/containment"); await expect(page.getByText("Chapter 4 completed. Chapter 5 unlocked.", { exact: true })).toBeVisible(); await expect(page.getByText("Saved score: 87 / 105", { exact: true })).toBeVisible(); await expect(page.locator(".pg-hints ol li")).toHaveCount(1); await expect(page.getByRole("article", { name: "Fictional snapshot CCTV-A-08", exact: true })).toBeVisible();
  const state = await (await page.request.get("/api/game")).json(); expect(state.current).toBe(4); expect(state.progress.chapters[3].score).toBe(20); expect(state.progress.bonus).toBe(5); expect(state.insiderUnlocked).toBe(true);
  for (const [route, title] of [["inbox", "The Inbox"], ["trail", "Trail"], ["insider", "Insider"]]) { await page.goto(`/play/${route}`); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible(); }
});
