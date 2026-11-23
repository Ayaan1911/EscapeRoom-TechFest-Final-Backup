// Browser helpers that solve a chapter through the Phase 2 task UI (one task at a time, as a team would).
import { expect, type Page } from "@playwright/test";
import { inboxAnswers } from "./inbox";
import { trailAnswers } from "./trail";
import { insiderAnswers } from "./insider";
import { containmentAnswers } from "./containment";
import { verdictAnswers } from "./verdict";

type V = "A" | "B" | "C";
/** GHOST//OS tools are dock windows. Open one by its app id (no-op if already open); closeAllTools clears the desk so windows never cover the task panels. */
export async function openTool(page: Page, app: string) {
  const dock = page.locator(`.os-dock-btn[data-app="${app}"]`);
  if ((await dock.getAttribute("aria-pressed")) !== "true") await dock.click();
  await expect(page.locator(`[data-window="${app}"]`)).toBeVisible();
}
export async function closeAllTools(page: Page) { await page.getByRole("button", { name: "Reset window layout" }).click(); await expect(page.locator("[data-window]")).toHaveCount(0); }
/** Submits one task panel and waits for the server's reply (the 3 s evidence cooldown makes the button wait). */
export async function submitTask(page: Page, region: string, expectText: RegExp = /\+\d+ points\. Task \d+\/\d+|No new points/) {
  const panel = page.getByRole("region", { name: region, exact: true }), button = panel.getByRole("button", { name: /Submit task|Resubmit task/ });
  if (await panel.getByRole("button", { name: "Task complete" }).count()) return; // already earned in full
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await button.click();
  await expect(panel.getByText(expectText)).toBeVisible({ timeout: 15_000 });
}
export async function solveInbox(page: Page, variant: V, only?: "entry" | "identity" | "impact") {
  const a = inboxAnswers[variant];
  if (!only || only === "entry") {
    await page.getByRole("complementary", { name: "Recovered emails" }).getByRole("button").filter({ hasText: a.emailId }).click();
    const mark = page.getByRole("button", { name: /Mark as breach email/ }); if (await mark.count()) await mark.click(); // idempotent: already marked stays marked
    await page.getByLabel("Delivery / navigation record").selectOption(a.deliveryId);
    await page.getByLabel("Capture ID").fill(a.snapshotId);
    await submitTask(page, "Delivery and entry point");
  }
  if (!only || only === "identity") {
    await page.getByLabel("Sign-in record").selectOption(a.authenticationId); await page.getByLabel("Session ID").fill(a.sessionId);
    await submitTask(page, "Authentication and session");
  }
  if (!only || only === "impact") { await page.getByLabel("Database export record").selectOption(a.databaseId); await submitTask(page, "Unauthorized export"); }
}
async function pinEvent(page: Page, id: string) {
  await openTool(page, "console");
  await page.getByLabel("Search records", { exact: true }).fill(id);
  await page.getByRole("button", { name: `Inspect ${id}`, exact: true }).click();
  const pin = page.getByRole("button", { name: /Pin as evidence/ });
  if (await pin.count()) await pin.click(); // already pinned earlier: leave it
  await closeAllTools(page);
}
export async function solveTrail(page: Page, variant: V, opts: { sourceIp?: string } = {}) {
  const a = trailAnswers[variant];
  await page.getByLabel("Compromised account", { exact: true }).fill(a.account);
  await page.getByLabel("Attacker source IP", { exact: true }).fill(opts.sourceIp ?? a.sourceIp);
  await submitTask(page, "Compromised account and source");
  await page.getByLabel("Incident session ID", { exact: true }).fill(a.sessionId); await page.getByLabel("Replay event ID", { exact: true }).fill(a.eventId);
  await submitTask(page, "Replayed session and event");
  await pinEvent(page, a.supportingEvidenceIds[0]);
  await openTool(page, "records");
  for (const id of a.supportingEvidenceIds.slice(1)) { const pin = page.getByRole("button", { name: `Pin ${id}`, exact: true }); if (await pin.count()) await pin.click(); }
  await closeAllTools(page);
  await submitTask(page, "Corroborating evidence");
}
export async function solveInsider(page: Page, variant: V) {
  const a = insiderAnswers[variant];
  await page.getByLabel("Insider employee").selectOption(a.employeeId); await submitTask(page, "Insider identified");
  await page.getByLabel("Unauthorized policy action").selectOption(a.actionId); await submitTask(page, "Policy action identified");
  await openTool(page, "dossier");
  for (const id of a.supportingEvidenceIds) {
    await page.getByLabel("Search dossier", { exact: true }).fill(id);
    await page.getByRole("region", { name: "Dossier records", exact: true }).getByRole("button").first().click();
    const pin = page.getByRole("button", { name: /^☆ Pin evidence/ });
    if (await pin.count()) await pin.click(); // idempotent: already pinned stays pinned
  }
  await closeAllTools(page);
  await submitTask(page, "Intent, access and approval evidence");
}
export async function arrange(page: Page, kind: "event" | "recovery", target: readonly string[]) {
  const attribute = kind === "event" ? "data-event-id" : "data-recovery-id";
  for (const [position, id] of target.entries()) {
    while ((await page.locator(`[${attribute}]`).evaluateAll((cards, attr) => cards.map(card => card.getAttribute(attr)), attribute)).indexOf(id) > position) await page.getByRole("button", { name: `Move ${kind} ${id} up`, exact: true }).click();
  }
  expect(await page.locator(`[${attribute}]`).evaluateAll((cards, attr) => cards.map(card => card.getAttribute(attr)), attribute)).toEqual([...target]);
}
export async function solveContainment(page: Page, variant: V, recoveryOrder?: readonly string[]) {
  const a = containmentAnswers[variant];
  await arrange(page, "event", a.eventOrder); await submitTask(page, "Incident timeline");
  await page.getByLabel("Affected account", { exact: true }).fill(a.account); await page.getByLabel("Affected session", { exact: true }).fill(a.sessionId); await submitTask(page, "Affected account and session");
  for (const id of a.immediateActions) await page.getByLabel(`Select immediate ${id}`, { exact: true }).setChecked(true);
  await submitTask(page, "Parallel urgent response");
  for (const id of a.recoveryOrder) await page.getByLabel(`Select recovery ${id}`, { exact: true }).setChecked(true);
  await arrange(page, "recovery", recoveryOrder ?? a.recoveryOrder); await submitTask(page, "Ordered recovery");
  for (const id of a.supportingEvidenceIds) await page.getByLabel(`Pin evidence ${id}`, { exact: true }).setChecked(true);
  await submitTask(page, "Supporting evidence");
}
export async function solveVerdict(page: Page, variant: V) {
  const a = verdictAnswers[variant];
  const step = (name: string) => page.getByRole("navigation", { name: /Causal chain/ }).getByRole("button", { name: new RegExp(name) }).click();
  await step("Entry"); await page.getByLabel("Initial compromise email").selectOption(a.chain.emailId); await page.getByLabel("Captured redirect").selectOption(a.chain.captureId); await submitTask(page, "Entry chain");
  await step("Session"); await page.getByLabel("Victim account").selectOption(a.chain.victimAccount); await page.getByLabel("Replayed session").selectOption(a.chain.sessionId); await page.getByRole("combobox", { name: "Unauthorized export", exact: true }).selectOption(a.chain.exportId); await submitTask(page, "Session and impact chain");
  await step("Insider"); await page.getByLabel("Internal accomplice").selectOption(a.chain.insiderId); await page.getByLabel("Policy modification").selectOption(a.chain.policyId); await submitTask(page, "Internal assistance chain");
  await step("Evidence map"); await openTool(page, "board");
  for (const [role, ids] of Object.entries(a.evidenceMap)) for (const id of ids) await page.getByLabel(`Evidence role for ${id}`, { exact: true }).selectOption(role);
  await closeAllTools(page);
  await submitTask(page, "Evidence map");
  await step("Verdict");
  await page.getByLabel("Best-supported").selectOption(a.hypothesisId); await page.getByRole("combobox", { name: "Reject", exact: true }).selectOption(a.rejected.hypothesisId); await page.getByRole("combobox", { name: "Contradiction", exact: true }).selectOption(a.rejected.contradiction);
  await page.getByLabel("Attacker attribution").selectOption(a.attackerAttribution); await page.getByLabel("Response status").selectOption(a.responseStatus);
  for (const id of a.rejected.evidenceIds) await page.getByLabel(`Counter-evidence ${id}`, { exact: true }).check();
  await submitTask(page, "Hypothesis and contradiction");
}
/** Logs out and waits for the login page. Retries the click because a click before React hydrates is a no-op (dev server). */
export async function logout(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 3000 });
  }).toPass({ timeout: 25_000 });
}
