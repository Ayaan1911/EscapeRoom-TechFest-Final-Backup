import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.skip(!process.env.GHOST_E2E_REDESIGN, "Run: node scripts/redesign-e2e.mjs tests/demo-mode.spec.ts (disposable local database)");
test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const code = () => process.env.GHOST_E2E_TEAM_CODE!;

/** count + content hash of every competition table (sessions of logins and the login throttle excluded: signing in legitimately writes those). */
async function snapshot() {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('TeamSession', 'LoginAttempt', '_prisma_migrations') order by 1`;
  const out: Record<string, string> = {};
  for (const { table_name } of tables) {
    const r = await prisma.$queryRawUnsafe<{ c: bigint; h: string }[]>(`select count(*)::bigint as c, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from "${table_name}" t`);
    out[table_name] = `${r[0].c}:${r[0].h}`;
  }
  return out;
}
async function organizer(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
}
const demoNote = /Demo (input|selection) recorded/;

test.beforeAll(async () => { await prisma.gameSession.deleteMany(); await prisma.r2Session.deleteMany(); }); // neither round has ever been started
test.afterAll(async () => { await prisma.$disconnect(); });

test("anonymous browsers and team sessions cannot open demo mode; the real routes stay protected", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of ["/admin/demo", "/admin/demo/round1", "/admin/demo/round1/inbox", "/admin/demo/round1/verdict", "/admin/demo/round2?unit=B2"]) {
    await page.goto(path); await expect(page).toHaveURL(/\/organizer\/login/);
  }
  await page.goto("/login"); await page.getByLabel("Team ID").fill("UI-A"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/play/);
  for (const path of ["/admin/demo", "/admin/demo/round1/trail", "/admin/demo/round2"]) { await page.goto(path); await expect(page).toHaveURL(/\/organizer\/login/); }
  await expect(page.getByText("NO REAL SCORES")).toHaveCount(0);
});

test("organizer enters demo from the dashboard; the whole walkthrough makes no API call and writes nothing", async ({ page }) => {
  test.setTimeout(300_000);
  await organizer(page);
  await expect(page.getByRole("link", { name: "ENTER DEMO MODE" })).toBeVisible();
  const before = await snapshot();
  expect(before.GameSession).toBe("0:" + before.GameSession.split(":")[1]); // Round 1 has never started
  expect(before.R2Session.startsWith("0:")).toBe(true);
  const api: string[] = []; page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(`${r.method()} ${u.pathname}`); });

  await page.getByRole("link", { name: "ENTER DEMO MODE" }).click(); await expect(page).toHaveURL(/\/admin\/demo$/);
  await expect(page.getByRole("heading", { name: /demonstration mode/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Demo controls" }).getByText("NO REAL SCORES")).toBeVisible();

  await page.getByRole("link", { name: "Open mission dashboard" }).click(); await expect(page.getByRole("heading", { name: /Mission operations/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Investigation stages" }).getByRole("listitem")).toHaveCount(5); // every chapter open, none locked

  // Chapter 1: real Inbox desk, simulated submit
  await page.goto("/admin/demo/round1/inbox"); await expect(page.getByRole("heading", { name: "The Inbox" })).toBeVisible();
  await page.getByRole("complementary", { name: "Recovered emails" }).getByRole("button").nth(1).click();
  await page.getByRole("button", { name: /Mark as breach email/ }).click();
  await page.getByLabel("Delivery / navigation record").selectOption({ index: 1 }); await page.getByLabel("Capture ID").fill("DEMO-CAPTURE");
  const entry = page.getByRole("region", { name: "Delivery and entry point", exact: true });
  await entry.getByRole("button", { name: "Submit task" }).click(); await expect(entry.getByText(demoNote)).toBeVisible();
  await expect(page.getByText("DEMO", { exact: true }).first()).toBeVisible(); // header shows DEMO instead of a clock
  // Reset demo clears the preview state (and only that)
  await page.getByRole("button", { name: "Reset demo" }).click(); await expect(page.getByLabel("Capture ID")).toHaveValue("");

  // Chapter 2: timeline, pin, use in answer
  await page.goto("/admin/demo/round1/trail"); await expect(page.getByRole("heading", { name: "Trail" })).toBeVisible();
  await page.locator(".ds-tl-dot").nth(3).click(); await page.getByRole("button", { name: /Pin as evidence/ }).click(); await expect(page.getByRole("button", { name: /Pinned as evidence/ })).toBeVisible();
  await page.getByRole("button", { name: "Use in my answer" }).click();
  const source = page.getByRole("region", { name: "Compromised account and source", exact: true });
  await source.getByRole("button", { name: "Submit task" }).click(); await expect(source.getByText(demoNote)).toBeVisible();

  // Chapter 3: the unlocked dossier is open without fragments
  await page.goto("/admin/demo/round1/insider"); await expect(page.getByRole("heading", { name: "The Evidence Wall" })).toBeVisible();
  await expect(page.getByText("DOSSIER SEALED")).toHaveCount(0);
  await page.getByRole("button", { name: /^Filter to / }).first().click();
  await page.locator(".ds-tl-dot").first().click(); await page.getByRole("button", { name: /Pin evidence ID/ }).click(); await expect(page.getByRole("button", { name: /Unpin evidence/ })).toBeVisible();

  // Chapter 4
  await page.goto("/admin/demo/round1/containment"); await expect(page.getByRole("heading", { name: "Containment" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Select immediate/ }).first().check();
  const urgent = page.getByRole("region", { name: "Parallel urgent response", exact: true });
  await urgent.getByRole("button", { name: "Submit task" }).click(); await expect(urgent.getByText(demoNote)).toBeVisible();

  // Chapter 5
  await page.goto("/admin/demo/round1/verdict"); await expect(page.getByRole("heading", { name: "Final Verdict" })).toBeVisible();
  await page.getByLabel("Initial compromise email").selectOption({ index: 1 }); await page.getByLabel("Captured redirect").selectOption({ index: 1 });
  const chain = page.getByRole("region", { name: "Entry chain", exact: true });
  await chain.getByRole("button", { name: "Submit task" }).click(); await expect(chain.getByText(demoNote)).toBeVisible();
  await page.getByRole("link", { name: "Back to Investigation Dashboard" }).click(); await expect(page).toHaveURL(/\/admin\/demo\/round1$/); // navigation stays inside the preview

  // Round 2: all eight units, no clock, no enrollment
  for (const unit of ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]) {
    await page.goto(`/admin/demo/round2?unit=${unit}`); await expect(page.locator(`.r2-unit[data-unit="${unit}"]`)).toBeVisible();
    await expect(page.getByRole("timer")).toHaveCount(0);
  }
  await page.goto("/admin/demo/round2?unit=A2");
  const id = page.locator('[data-task="i2.identify"]'); await id.locator("input[type=checkbox]").nth(0).check(); await id.locator("input[type=checkbox]").nth(2).check();
  await id.getByRole("button", { name: "Submit task" }).click(); await expect(id.getByText(demoNote)).toBeVisible();
  await page.goto("/admin/demo/round2?unit=B2"); await expect(page.getByText("Compare two records")).toBeVisible(); // open by default in Part B
  await page.getByLabel("Record A").selectOption({ index: 1 }); await page.getByLabel("Record B").selectOption({ index: 2 }); await expect(page.getByRole("status").filter({ hasText: /sources?/i }).first()).toBeVisible();

  // Exit returns to the organizer dashboard
  await page.getByRole("link", { name: "Exit demo" }).click(); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();

  expect(api, "demo mode must not call any API route").toEqual([]);
  const after = await snapshot();
  expect(after).toEqual(before); // teams, rounds, submissions, scores, drafts, audit, Round 2 tables: byte-identical
});

test("normal play is unaffected: a team still sees the real dashboard and no demo controls", async ({ page }) => {
  test.setTimeout(90_000);
  await prisma.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000), scoringPolicy: "best-v1" } });
  await page.goto("/login"); await page.getByLabel("Team ID").fill("UI-A"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investigation dashboard", exact: true })).toBeVisible();
  await page.goto("/play/inbox"); await expect(page.getByRole("timer", { name: "Round time remaining" })).toBeVisible();
  await expect(page.getByText("NO REAL SCORES")).toHaveCount(0);
});
