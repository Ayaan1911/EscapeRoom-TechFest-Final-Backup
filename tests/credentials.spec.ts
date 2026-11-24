import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";
import { generateBundle } from "../scripts/credentials-lib.mjs";
import { importBundle } from "../scripts/credentials-db.mjs";

// Final credentials in the real UI. Run: node scripts/redesign-e2e.mjs tests/credentials.spec.ts (disposable local database; a TEST bundle is generated and imported here; no real credential exists in this run).
test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/credentials.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient(), SHOTS = "D:/Ghost404-TestWorkspace/shots/credentials"; mkdirSync(SHOTS, { recursive: true });
const bundle = generateBundle(), pw = (id: string) => bundle.teams.find(t => t.id === id)!.password;
test.afterAll(async () => { await prisma.$disconnect(); });

async function signIn(page: Page, id: string, password: string) { await page.goto("/login"); await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/); }
async function organizer(page: Page) { await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(process.env.GHOST_E2E_ADMIN_CODE ?? process.env.GHOST_E2E_TEAM_CODE!); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible({ timeout: 30_000 }); }

test("the 32 provisioned accounts sign in with the printed credentials; the reserve waits", async ({ browser }) => {
  test.setTimeout(180_000);
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`;
  expect((await importBundle(prisma, bundle, { apply: true, confirmDatabase: name })).status).toBe("applied");
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await ctx.newPage(), problems: string[] = [];
  page.on("pageerror", e => problems.push(e.message)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  await page.goto("/login"); await page.getByLabel("Team ID").fill("TEAM-01"); await page.getByLabel("Access code").fill(pw("TEAM-01"));
  await page.getByRole("button", { name: "Show password" }).click(); await expect(page.getByLabel("Access code")).toHaveValue(pw("TEAM-01")); await expect(page.getByLabel("Access code")).toHaveAttribute("type", "text"); // the eye still works with the new password format
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL(/\/play/);
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, "team-02", pw("TEAM-02").toLowerCase()); await page.getByRole("button", { name: "Log out" }).click(); // lower-case typing reaches the same account
  await page.goto("/login"); await page.getByLabel("Team ID").fill("TEAM-03"); await page.getByLabel("Access code").fill("AAA-AAA-AAA"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Access denied" })).toBeVisible(); // a wrong password is refused
  // the in-game Forensic Snapshot (Chapter 1) still works for a provisioned team
  await signIn(page, "TEAM-03", pw("TEAM-03")); await page.goto("/play/inbox"); await expect(page.getByRole("heading", { name: "The Inbox", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Open Forensic Snapshot" }).click(); await expect(page.getByRole("heading", { name: "Captured authentication page" })).toBeVisible(); await expect(page.locator("body")).toContainText(/CAP-[ABC]-17/); 
  // the reserve: signs in, sees a clear reserve screen, cannot play
  const rctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), reserve = await rctx.newPage(); await signIn(reserve, "TEAM-31", pw("TEAM-31"));
  await expect(reserve.getByText("This reserve account is not active")).toBeVisible({ timeout: 20_000 }); await expect(reserve.getByText("Awaiting organizer start")).toHaveCount(0);
  await reserve.goto("/play/inbox"); await expect(reserve).toHaveURL(/\/play$/); await reserve.screenshot({ path: `${SHOTS}/reserve-waiting.png` });
  const post = await reserve.request.post("/api/game", { headers: { Origin: "http://127.0.0.1:3000" }, data: { action: "hint", chapter: 0 } }); expect((await post.json()).error ?? "").toMatch(/reserve account is not active|not active|not open/i);
  expect(problems).toEqual([]); await ctx.close(); await rctx.close();
});

test("organizer: credentials status without any password, reserve replacement, retired Chapter 1 kit", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await ctx.newPage(); await organizer(page);
  await expect(page.getByRole("link", { name: /Chapter 1 evidence kit/ })).toHaveCount(0); await expect(page.getByRole("link", { name: "Team credentials" })).toBeVisible();
  await page.goto("/admin/inbox-kit"); await expect(page.getByRole("heading", { name: "Chapter 1 evidence kit: retired" })).toBeVisible(); await expect(page.locator("img, canvas")).toHaveCount(0);
  await page.goto("/admin/credentials"); await expect(page.getByRole("heading", { name: /provisioning status/ })).toBeVisible();
  const summary = page.getByRole("region", { name: "Provisioning summary" }); await expect(summary).toContainText("32 of 32"); await expect(summary).toContainText("Group A (active primary)"); await expect(summary).toContainText("3 of 3 pairs"); await expect(summary).toContainText("matches the expected provisioning set");
  const text = await page.locator("main").innerText(); for (const t of bundle.teams) expect(text).not.toContain(t.password); for (const g of ["A", "B", "C"] as const) { expect(text).not.toContain(bundle.fragments[g].private); expect(text).not.toContain(bundle.fragments[g].public); } // status only: no secret on the page
  const html = await page.content(); for (const t of bundle.teams) expect(html).not.toContain(t.password);
  await page.screenshot({ path: `${SHOTS}/credentials-status.png`, fullPage: true });
  const group = bundle.teams.find(t => t.id === "TEAM-02")!.group!;
  await page.locator('select[name="reserveId"]').selectOption("TEAM-31"); await page.locator('select[name="replacesId"]').selectOption("TEAM-02"); await page.getByLabel("Reason (audited)").fill("printed card unreadable (test)");
  await page.getByRole("button", { name: "Activate reserve as replacement" }).click();
  await expect(page.getByRole("status").filter({ hasText: `TEAM-31 now replaces TEAM-02 (Group ${group})` })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("tr[data-team-id='TEAM-31']")).toContainText("ACTIVE"); await expect(summary).toContainText("matches the expected provisioning set"); // still 10/10/10 among active teams
  await page.screenshot({ path: `${SHOTS}/credentials-after-replacement.png`, fullPage: true });
  // the participant APIs never enumerate credentials
  const tctx = await browser.newContext(), team = await tctx.newPage(); await signIn(team, "TEAM-31", pw("TEAM-31"));
  await expect(team.getByText("This reserve account is not active")).toHaveCount(0); const state = JSON.stringify(await (await team.request.get("/api/game")).json()); for (const t of bundle.teams) expect(state).not.toContain(t.password); expect(state).toContain(`"insiderGroup":{"group":"${group}"`);
  await team.goto("/admin/credentials"); await expect(team).toHaveURL(/\/organizer\/login/); await expect(team.locator("body")).not.toContainText("provisioning status"); // a team session cannot reach the organizer credentials page
  const replaced = await tctx.newPage(); void replaced; await tctx.close(); await ctx.close();
});
