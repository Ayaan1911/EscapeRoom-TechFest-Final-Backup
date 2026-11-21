import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { taskAnswer } from "./fixtures/tasks";

// Round 1 attempt counters and best-v1 wording in the real UI. Runs only in a best-v1 round:
//   GHOST_P2_POLICY=best-v1 GHOST_PHASE2=1 node scripts/phase2-e2e.mjs tests/phase6a-attempts.spec.ts
test.skip(process.env.GHOST_P2_POLICY !== "best-v1", "needs a round started under best-v1");
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
test.afterAll(async () => { await prisma.$disconnect(); });
async function login(page: Page, id: string) {
  await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
}

test("Tier A (Inbox 'Unauthorized export', 2 attempts): counter, wording, exhausted state, server refusal", async ({ page }) => {
  // the candidate list holds one wrong database record, so one attempt is pre-spent in the disposable database to reach the exhausted state with a single UI submission
  await prisma.taskScore.create({ data: { teamId: "P2-FRESH-C", chapter: 0, taskId: "inbox.impact", earned: 0, max: 3, criteria: "[]", attempts: 1 } });
  await login(page, "P2-FRESH-C"); await page.goto("/play/inbox");
  const panel = page.getByRole("region", { name: "Unauthorized export" }), select = panel.getByLabel("Database export record");
  await expect(panel.getByText("Attempts 1/2")).toBeVisible();
  await expect(panel.getByText(/Your highest-scoring submission counts\. 1 attempt remaining\./)).toBeVisible();
  const right = (taskAnswer("inbox.impact", "C") as { databaseId: string }).databaseId;
  const options = await select.locator("option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
  await select.selectOption(options.filter(o => o !== right)[0]);
  await panel.getByRole("button", { name: "Submit task" }).click();
  await expect(panel.getByText("Attempts 2/2")).toBeVisible();
  await expect(panel.getByText(/No attempts remaining\. Your highest score has been saved\./).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "No attempts remaining" })).toBeDisabled();
  const res = await page.request.post("/api/game", { data: { action: "submit", chapter: 0, task: "inbox.impact", answer: { databaseId: right } }, headers: { origin: "http://127.0.0.1:3000" } });
  expect([409, 429]).toContain(res.status()); expect((await res.json()).error).toMatch(/No attempts remaining|wait/i);
});

test("Tier B (Inbox 'Delivery and entry point', 3 attempts): best-coherent improvement and identical-submission idempotency", async ({ page }) => {
  await login(page, "P2-FRESH-A"); await page.goto("/play/inbox");
  const panel = page.getByRole("region", { name: "Delivery and entry point" }), entry = taskAnswer("inbox.entry", "A") as Record<string, string>;
  await expect(panel.getByText("Attempts 0/3")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${entry.emailId}`) }).click(); await page.getByRole("button", { name: /Mark as breach email/ }).click();
  await page.getByLabel("Delivery / navigation record").selectOption(entry.deliveryId);
  await page.getByLabel("Capture ID").fill("x-wrong"); // right email and delivery, wrong capture: 4 of 6
  await panel.getByRole("button", { name: "Submit task" }).click();
  await expect(panel.getByText(/New personal best: \+4 points\. Task 4\/6\./)).toBeVisible(); await expect(panel.getByText("Attempts 1/3")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Resubmit task" })).toBeEnabled({ timeout: 8000 });
  await panel.getByRole("button", { name: "Resubmit task" }).click(); // the identical answer again
  await expect(panel.getByText(/Already submitted: no change and no attempt used\./)).toBeVisible(); await expect(panel.getByText("Attempts 1/3")).toBeVisible();
  await page.getByLabel("Capture ID").fill(entry.snapshotId); // the fully coherent answer improves the best
  await expect(panel.getByRole("button", { name: "Resubmit task" })).toBeEnabled({ timeout: 8000 });
  await panel.getByRole("button", { name: "Resubmit task" }).click();
  await expect(panel.getByText(/New personal best: \+2 points\. Task 6\/6\./)).toBeVisible(); await expect(page.getByText("Attempts 2/3").first()).toBeVisible();
});

test("Tier C (Trail 'Corroborating evidence', 5 attempts) shows its counter in the Trail chapter", async ({ page }) => {
  await login(page, "P2-MID-A"); await page.goto("/play/trail");
  const panel = page.getByRole("region", { name: "Corroborating evidence" });
  await expect(panel.getByText("Attempts 0/5")).toBeVisible();
  await expect(panel.getByText(/Your highest-scoring submission counts\. 5 attempts remaining\./)).toBeVisible();
});
