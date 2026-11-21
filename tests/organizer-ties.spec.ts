import { expect, test, type Page } from "@playwright/test";

// Organizer exact-tie flow with ORDINARY Playwright clicks only (no dispatchEvent, no force). Seeded, already-finished disposable round:
//   GHOST_P5_SEED=1 GHOST_P5_FINISHED=1 node scripts/phase5-e2e.mjs tests/organizer-ties.spec.ts
// Covers: auto-refresh left running, a slow network, a refresh while the dialog is open, cancel and re-open, audit record, publication gating.
const code = process.env.GHOST_E2E_TEAM_CODE!, origin = process.env.GHOST_BASE_URL ?? "http://127.0.0.1:3000";
test.skip(process.env.GHOST_P5_FINISHED !== "1", "needs the seeded finished round");
test.setTimeout(240_000);

async function organizer(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin"); await page.goto("/admin/round2");
  await expect(page.getByRole("region", { name: "Exact ties" })).toBeVisible({ timeout: 60_000 });
}
const REASON = "Exact tie reviewed; shared rank accepted for the final ranking";

test("tie acknowledgment: ordinary clicks, auto-refresh running, slow network, refresh while the dialog is open", async ({ page }) => {
  await organizer(page);
  const ties = page.getByRole("region", { name: "Exact ties" }), publish = page.getByRole("button", { name: "Publish results" });
  await expect(page.getByLabel(/Auto-refresh scores and clock/)).toBeChecked(); // auto-refresh is ON for this whole test
  await expect(publish).toBeDisabled();
  expect((await page.request.post("/api/round2/admin", { data: { action: "publish" }, headers: { origin } })).status()).toBe(409);
  // 1) leave the page idle across at least one auto-refresh cycle (15 s) before acting
  await page.waitForTimeout(17_000);
  await expect(ties).toBeVisible();
  // 2) dialog stays open across an auto-refresh tick and a manual refresh; cancel and re-open
  await ties.getByLabel(/Reason for acknowledging/).fill(REASON);
  const ack = ties.getByRole("button", { name: "Acknowledge exact tie" }).first();
  await ack.click(); const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("cannot select a winner");
  await page.waitForTimeout(16_000); // an auto-refresh fires while the dialog is open
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole("button", { name: "Acknowledge exact tie" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click(); await expect(dialog).toBeHidden();
  expect((await (await page.request.get("/api/round2/admin?view=results")).json()).unacknowledgedTies).toBeGreaterThan(0);
  // 3) a browser refresh while the dialog is open: the page reloads cleanly, nothing was recorded, the flow can be redone
  await ties.getByLabel(/Reason for acknowledging/).fill(REASON); await ack.click(); await expect(dialog).toBeVisible();
  await page.reload(); await expect(page.getByRole("region", { name: "Exact ties" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await page.request.get("/api/round2/admin?view=results")).json()).unacknowledgedTies).toBeGreaterThan(0);
  // 4) slow network: every organizer API call takes 1.5 s; the confirm still resolves once and the UI never claims success early
  await page.route("**/api/round2/admin**", async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  await ties.getByLabel(/Reason for acknowledging/).fill(REASON);
  await ties.getByRole("button", { name: "Acknowledge exact tie" }).first().click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Acknowledge exact tie" });
  await confirm.click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Working…" })).toBeVisible(); // in flight: not yet claimed
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("acknowledged", { timeout: 30_000 });
  // the regression for the reported defect: the success message used to appear BEFORE the refreshed state, leaving a stale, clickable "Acknowledge" button next to it
  expect(await ties.getByRole("button", { name: "Acknowledge exact tie" }).count()).toBe(0); // read immediately, no waiting
  await expect(ties).toContainText("Acknowledged:");
  await page.unroute("**/api/round2/admin**");
  // 5) audit record, shared rank preserved, no winner chosen, publication now available
  const audit = await (await page.request.get("/api/round2/admin?view=audit")).json();
  const rec = audit.events.filter((e: { action: string }) => e.action === "acknowledge-tie");
  expect(rec).toHaveLength(1); expect(JSON.parse(rec[0].detail)).toMatchObject({ decision: "shared-rank", reason: REASON });
  const res = await (await page.request.get("/api/round2/admin?view=results")).json();
  expect(res.unacknowledgedTies).toBe(0); expect(res.ranked.filter((r: { tie: boolean }) => r.tie).every((r: { rank: number }) => r.rank === res.ties[0].rank)).toBe(true);
  expect(await page.getByRole("button", { name: /winner|select|choose/i }).count()).toBe(0);
  await expect(publish).toBeEnabled(); await expect(ties).toContainText("Acknowledged:");
  // 6) publish with the typed confirmation
  await publish.click(); const pd = page.getByRole("dialog"); await expect(pd).toContainText("irreversible");
  await pd.getByLabel(/Type PUBLISH/).fill("PUBLISH"); await pd.getByRole("button", { name: "Publish results" }).click();
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("Results published");
  expect((await (await page.request.get("/api/round2/admin?view=results")).json()).published).toBe(true);
});
