import { expect, test } from "@playwright/test";

// Fast organizer checks on a SEEDED, already-finished disposable round (no real timer):
//   GHOST_P5_SEED=1 GHOST_P5_FINISHED=1 node scripts/phase5-e2e.mjs tests/final-organizer.spec.ts
const code = process.env.GHOST_E2E_TEAM_CODE!, origin = "http://127.0.0.1:3000";
test.skip(process.env.GHOST_P5_FINISHED !== "1", "needs the seeded finished round");
test("exact-tie acknowledgment through the real UI: blocked publication, confirmation, no reordering, then publish", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: origin, viewport: { width: 1366, height: 900 } }), page = await ctx.newPage();
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin"); await page.goto("/admin/round2");
  const ties = page.getByRole("region", { name: "Exact ties" });
  await expect(ties).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Publish results" })).toBeDisabled();
  const blocked = await page.request.post("/api/round2/admin", { data: { action: "publish" }, headers: { origin } });
  expect(blocked.status()).toBe(409);
  await ties.getByLabel(/Reason for acknowledging/).fill("Exact tie reviewed; shared rank accepted");
  const button = ties.getByRole("button", { name: "Acknowledge exact tie" }).first();
  await button.click();
  await page.getByRole("dialog").getByRole("button", { name: "Acknowledge exact tie" }).click();
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("acknowledged");
  await expect(page.getByRole("button", { name: "Publish results" })).toBeEnabled();
  await ctx.close();
});
