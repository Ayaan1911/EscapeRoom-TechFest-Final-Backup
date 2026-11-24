import { expect, test } from "@playwright/test";

test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/ui-projector.spec.ts (disposable local database)");
const ORIGIN = "http://127.0.0.1:3000";

test("projector is private by default: anonymous and team sessions are refused, the page redirects to organizer sign-in", async ({ page, request }) => {
  test.setTimeout(90_000);
  expect((await request.get("/api/admin/projector")).status()).toBe(401);
  await page.goto("/admin/projector"); await expect(page).toHaveURL(/\/organizer\/login/);
  await page.goto("/login"); await page.getByLabel("Team ID").fill("UI-A"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Investigation dashboard" })).toBeVisible();
  expect((await page.request.get("/api/admin/projector")).status()).toBe(401); // a signed-in team is not an organizer
  await page.goto("/admin/projector"); await expect(page).toHaveURL(/\/organizer\/login/);
});

test("organizer projector: server-chosen scene, minimal payload, standings only after an audited switch, no controls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE!); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
  await page.getByRole("navigation", { name: "Event control" }).getByRole("link", { name: "Projector" }).click(); await expect(page).toHaveURL(/\/admin\/projector$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Team standings" })).toHaveCount(0); // standings are OFF until the organizer switches them on
  const res = await page.request.get("/api/admin/projector"); expect(res.status()).toBe(200); expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json(); expect(Object.keys(body).sort()).toEqual(["finalists", "r1", "r2", "results", "scene", "serverNow", "standings"]);
  expect(body.standings).toBeNull(); expect(body.results).toBeNull();
  await page.goto("/admin/leaderboard"); const pub = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Round 1 standings" }) });
  await pub.getByLabel("Reason").fill("UI test: standings approved"); await pub.getByRole("button", { name: /Show on projector/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Confirm / }).click(); await expect(pub.getByText("Shown")).toBeVisible();
  await page.goto("/admin/projector"); await expect(page.getByRole("heading", { name: "Live leaderboard" })).toBeVisible({ timeout: 15_000 });
  const shown = await (await page.request.get("/api/admin/projector")).json();
  for (const t of shown.standings) expect(Object.keys(t).sort()).toEqual(["chaptersDone", "id", "name", "rank", "score", "tied"]);
  expect(JSON.stringify(shown)).not.toMatch(/codeHash|participants|access/i);
  expect((await page.request.post("/api/admin/projector", { headers: { Origin: ORIGIN }, data: {} })).status()).toBe(405); // read-only
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0); // the screen has no controls that could act on the game
});
