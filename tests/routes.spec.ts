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

test("organizer access is separate: no public link, role parameter ignored, noindex, auth still required", async ({ page, request }) => {
  await page.goto("/");
  expect(await page.locator("a[href*='organizer'], a[href*='role=admin'], a[href^='/admin']").count()).toBe(0);
  await expect(page.getByText(/organizer login/i)).toHaveCount(0);
  for (const url of ["/login", "/login?role=admin"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Team login" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organizer login" })).toHaveCount(0);
    await expect(page.getByLabel("Team ID")).toBeVisible();
    expect(await page.locator("input[name='role']").count()).toBe(0); // no client-selectable role
    expect(await page.locator("a[href*='organizer']").count()).toBe(0);
  }
  await page.goto("/organizer/login");
  await expect(page.getByRole("heading", { name: "Organizer login" })).toBeVisible();
  await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
  await expect(page.getByLabel("Team ID")).toHaveCount(0);
  for (const guess of ["/admin", "/admin/inbox-kit", "/admin/insider-kit?part=A&scope=all", "/admin/containment-kit"]) {
    await page.goto(guess); await expect(page).toHaveURL(/\/organizer\/login/);
  }
  expect((await request.get("/api/admin/scores")).status()).toBe(401);
});

test("a participant cannot become an organizer by forging the role or id fields", async ({ page }) => {
  test.skip(!process.env.GHOST_E2E_ADMIN_CODE, "needs the temporary organizer code");
  await page.goto("/login");
  await page.getByLabel("Team ID").fill("organizer");
  await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE!);
  await page.evaluate(() => { const f = document.querySelector("form")!; for (const [k, v] of [["role", "admin"], ["id", "organizer"]]) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.append(i); } });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".k-banner[role=alert]")).toContainText("Access denied");
  await page.goto("/admin"); await expect(page).toHaveURL(/\/organizer\/login/);
});
