import { expect, test } from "@playwright/test";

// Phase 4 browser checks for Round 2. AUTHORED, NOT EXECUTED in the storage-limited Phase 4 pass.
// Run only against a DISPOSABLE database (see docs/phase4-round2-ui.md): GHOST_PHASE4=1 plus
//   GHOST_R2_TEAM_ID / GHOST_R2_TEAM_CODE (an active finalist), GHOST_R2_OUTSIDER_ID / GHOST_R2_OUTSIDER_CODE (a non-finalist),
//   GHOST_R2_ADMIN_CODE (organizer). The round must be started by the test operator on the disposable database.
const finalist = { id: process.env.GHOST_R2_TEAM_ID, code: process.env.GHOST_R2_TEAM_CODE };
async function signIn(page: import("@playwright/test").Page, id?: string, code?: string) {
  await page.goto("/login?next=/round2");
  await page.getByLabel("Team ID").fill(id ?? ""); await page.getByLabel("Access code").fill(code ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("Round 2 APIs and pages reject anonymous visitors", async ({ page, request }) => {
  for (const url of ["/api/round2/status", "/api/round2/evidence", "/api/round2/drafts", "/api/round2/results", "/api/round2/admin?view=readiness"]) expect((await request.get(url)).status(), url).toBe(401);
  expect((await request.post("/api/round2/admin", { data: { action: "start" }, headers: { origin: `http://127.0.0.1:${process.env.GHOST_E2E_PORT ?? 3000}` } })).status()).toBeGreaterThanOrEqual(400);
  await page.goto("/round2"); await expect(page).toHaveURL(/\/login/);
  await page.goto("/admin/round2"); await expect(page).toHaveURL(/\/organizer\/login/);
});

test("a non-finalist sees only the access restriction", async ({ page }) => {
  test.skip(!process.env.GHOST_R2_OUTSIDER_ID, "needs a non-finalist team");
  await signIn(page, process.env.GHOST_R2_OUTSIDER_ID, process.env.GHOST_R2_OUTSIDER_CODE);
  await expect(page.getByRole("heading", { name: /confirmed finalists/i })).toBeVisible();
  await expect(page.getByText(/E-10\d/)).toHaveCount(0);
});

test("finalist command center: released incident, draft restore after reload, honest scoring feedback", async ({ page }) => {
  test.skip(!finalist.id, "needs an active finalist and a started disposable round");
  await signIn(page, finalist.id, finalist.code);
  await expect(page.getByRole("navigation", { name: "Incidents and challenges" })).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: /Incident 1/ }).click();
  const box = page.locator('[data-task="i1.assets"]');
  await box.getByLabel("Account p.okafor").check();
  await expect(box.getByText("Draft saved")).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('[data-task="i1.assets"]').getByLabel("Account p.okafor")).toBeChecked();
  await page.locator('[data-task="i1.assets"]').getByLabel("Laptop FIN-LT-07").check();
  await page.locator('[data-task="i1.assets"]').getByRole("button", { name: /Submit task|Resubmit task/ }).click();
  await expect(page.locator('[data-task="i1.assets"]').getByRole("status").filter({ hasText: /point/ }).first()).toBeVisible();
  // Incident 2 is locked until its server-side release time
  await expect(page.getByRole("button", { name: /Incident 4/ })).toBeDisabled();
});

test("organizer page renders without mutating anything", async ({ page, request }) => {
  test.skip(!process.env.GHOST_R2_ADMIN_CODE, "needs organizer credentials");
  await page.goto("/organizer/login");
  await page.getByLabel(/access code/i).fill(process.env.GHOST_R2_ADMIN_CODE!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.goto("/admin/round2");
  await expect(page.getByRole("heading", { name: "GHOST RETURNS control room" })).toBeVisible();
  await page.getByRole("button", { name: "Start Round 2" }).click(); // opens the confirmation dialog only
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  void request;
});
