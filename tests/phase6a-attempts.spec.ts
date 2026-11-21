import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { taskAnswer } from "./fixtures/tasks";

// Round 1 attempt counters and best-v1 wording in the real UI. Runs only in a best-v1 round:
//   GHOST_P2_POLICY=best-v1 GHOST_PHASE2=1 node scripts/phase2-e2e.mjs tests/phase6a-attempts.spec.ts
test.skip(process.env.GHOST_P2_POLICY !== "best-v1", "needs a round started under best-v1");
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
test.afterAll(async () => { await prisma.$disconnect(); });
test("Inbox 'Unauthorized export' (tier A, 2 attempts): counter, wording, exhausted state", async ({ page }) => {
  // the candidate list holds one wrong database record, so one attempt is pre-spent in the disposable database to reach the exhausted state with a single UI submission
  await prisma.taskScore.create({ data: { teamId: "P2-FRESH-C", chapter: 0, taskId: "inbox.impact", earned: 0, max: 3, criteria: "[]", attempts: 1 } });
  await page.goto("/login"); await page.getByLabel("Team ID").fill("P2-FRESH-C"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
  await page.goto("/play/inbox");
  const panel = page.getByRole("region", { name: "Unauthorized export" }), select = panel.getByLabel("Database export record");
  await expect(panel.getByText("Attempts 1/2")).toBeVisible();
  await expect(panel.getByText(/Your highest-scoring submission counts\. 1 attempt remaining\./)).toBeVisible();
  const right = (taskAnswer("inbox.impact", "C") as { databaseId: string }).databaseId;
  const options = await select.locator("option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
  const wrong = options.filter(o => o !== right);
  await select.selectOption(wrong[0]);
  await panel.getByRole("button", { name: "Submit task" }).click();
  await expect(panel.getByText("Attempts 2/2")).toBeVisible();
  await expect(panel.getByText(/No attempts remaining\. Your highest score has been saved\./).first()).toBeVisible();
  await expect(panel.getByRole("button", { name: "No attempts remaining" })).toBeDisabled();
  // the server refuses too, whatever the button says
  const res = await page.request.post("/api/game", { data: { action: "submit", chapter: 0, task: "inbox.impact", answer: { databaseId: right } }, headers: { origin: "http://127.0.0.1:3000" } });
  expect([409, 429]).toContain(res.status()); expect((await res.json()).error).toMatch(/No attempts remaining|wait/i);
});
