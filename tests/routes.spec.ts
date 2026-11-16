import { expect, test } from "@playwright/test";

test("Phase 0 routes show their shell content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A breach has a story/i })).toBeVisible();
  await page.getByRole("link", { name: /Enter investigation/i }).click();
  await expect(page.getByRole("heading", { name: "Team login" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
});

test("participant APIs reject anonymous requests", async ({ request }) => {
  expect((await request.get("/api/game")).status()).toBe(401);
  expect((await request.get("/api/admin/scores")).status()).toBe(401);
});

test("team session survives refresh and logout revokes access", async ({ page }) => {
  test.skip(!process.env.GHOST_E2E_TEAM_ID || !process.env.GHOST_E2E_TEAM_CODE, "Supply private development team credentials in the test runner environment");
  await page.goto("/login");
  await page.getByLabel("Team ID").fill(process.env.GHOST_E2E_TEAM_ID!);
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Investigation dashboard" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
  await page.goto("/play");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Team login" })).toBeVisible();
});
