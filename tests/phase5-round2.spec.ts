import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Phase 5 Round 2 browser journey against a DISPOSABLE PostgreSQL seeded by scripts/phase5-e2e.mjs (never a real database).
// The lifecycle is the legitimate one: confirm qualification -> enroll -> verify readiness -> start, all through the real UI.
// Elapsed time is simulated by moving the TEST session's stored start time (no real 50-minute clock is ever run).
// The lifecycle tests share one timeline, so they run serially; every gameplay test re-establishes the minute it needs.
const code = process.env.GHOST_E2E_TEAM_CODE!, origin = "http://127.0.0.1:3000", prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const shots = process.env.GHOST_SHOTS === "1";
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.afterAll(async () => { await prisma.$disconnect(); });

const atMinute = (m: number) => prisma.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - m * 60_000), endedAt: null } });
async function login(ctx: BrowserContext, id: string, next = "/round2") {
  const page = await ctx.newPage();
  await page.goto(`/login?next=${next}`);
  await page.getByLabel("Team ID").fill(id); await page.getByLabel("Access code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(u => u.pathname === next); // not a glob: "/login?next=/round2" would match it too
  return page;
}
const team = async (browser: Browser, id: string, viewport = { width: 1366, height: 800 }) => { const ctx = await browser.newContext({ baseURL: origin, viewport }); return { ctx, page: await login(ctx, id) }; };
async function organizer(browser: Browser, path = "/admin/round2") {
  const ctx = await browser.newContext({ baseURL: origin, viewport: { width: 1366, height: 900 } }), page = await ctx.newPage();
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin"); await page.goto(path);
  return { ctx, page };
}
// The command center opens on the newest released incident; most tests below work on Incident 1.
const inc1 = async (browser: Browser, id: string) => { const t = await team(browser, id); await open(t.page, /Incident 1/).click(); return t; };
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `test-results/phase5/shots/${name}.jpg`, type: "jpeg", quality: 55 }); };
const task = (page: Page, id: string) => page.locator(`[data-task="${id}"]`);
const submit = (page: Page, id: string) => task(page, id).getByRole("button", { name: /^(Submit|Resubmit) task$/ });
// After a reload the client has forgotten its countdown; the server still enforces the 3 s team-wide gap and says so. Click again once it allows.
async function send(page: Page, id: string) {
  await submit(page, id).click();
  const f = feedback(page, id);
  if (/Slow down/.test(await f.textContent({ timeout: 5000 }) ?? "")) { await waitReady(page, id); await submit(page, id).click(); }
}
const feedback = (page: Page, id: string) => task(page, id).locator(".r2-feedback");
const open = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "Incidents and challenges" }).getByRole("button", { name });
const waitReady = (page: Page, id: string) => expect(submit(page, id)).toBeEnabled({ timeout: 15_000 });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("anonymous visitors are redirected or refused everywhere", async ({ page, request }) => {
  for (const url of ["/api/round2/status", "/api/round2/evidence", "/api/round2/drafts", "/api/round2/results", "/api/round2/admin?view=readiness"]) expect((await request.get(url)).status(), url).toBe(401);
  expect((await request.post("/api/round2/submit", { data: { taskId: "i1.assets", answer: {} }, headers: { origin } })).status()).toBe(401);
  await page.goto("/round2"); await expect(page).toHaveURL(/\/login\?next=\/round2/);
  await page.goto("/admin/round2"); await expect(page).toHaveURL(/\/organizer\/login/);
});

test("organizer confirms the Round 1 qualification snapshot through the real UI", async ({ browser }) => {
  const { ctx, page } = await organizer(browser, "/admin");
  await page.getByLabel("Review reason").fill("Phase 5 disposable fixture review");
  await page.getByLabel(/I reviewed incomplete investigations/).check();
  await page.getByRole("button", { name: "Record qualification confirmation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm qualification record" }).click();
  await expect(page.getByText(/FINAL \/ ORGANIZER CONFIRMED/).first()).toBeVisible();
  await ctx.close();
});

test("control room before enrollment: snapshot shown, start blocked, finalists locked out", async ({ browser }) => {
  const { ctx, page } = await organizer(browser);
  await expect(page.getByRole("heading", { name: "GHOST RETURNS control room" })).toBeVisible();
  await expect(page.getByText("Finalist 01")).toBeVisible(); await expect(page.getByText("Finalist 12")).toBeVisible();
  await expect(page.getByText(/Not ready: blockers below/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Round 2" })).toBeDisabled();
  await shot(page, "organizer-before-enrollment");
  const api = await page.request.post("/api/round2/admin", { data: { action: "start" }, headers: { origin } });
  expect(api.status()).toBe(409); // the backend refuses too, not only the disabled button
  const t = await team(browser, "P5-01");
  await expect(t.page.getByRole("heading", { name: /confirmed finalists/i })).toBeVisible();
  await t.ctx.close(); await ctx.close();
});

test("organizer enrolls, a bad promotion is refused honestly, a valid one succeeds", async ({ browser }) => {
  const { ctx, page } = await organizer(browser);
  await page.getByRole("button", { name: "Enroll finalists" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enroll finalists" }).click();
  await expect(page.getByText(/Enrolled 12 teams/)).toBeVisible();
  await expect(page.getByText("10 active, 2 standby enrolled.")).toBeVisible();
  await page.getByRole("combobox", { name: /^Standby team/ }).selectOption("P5-11");
  await page.getByRole("textbox", { name: /^Reason \(5/ }).fill("Finalist 10 withdrew before the start");
  await page.getByRole("button", { name: "Promote standby" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Promote standby" }).click();
  await expect(page.locator(".r2a-msg.is-error")).toContainText(/active finalist to replace/); // 10 active and no replacement named
  await expect(page.getByText(/Promoted P5-11/)).toHaveCount(0);
  await page.getByRole("combobox", { name: /^Replaces/ }).selectOption("P5-10");
  await page.getByRole("button", { name: "Promote standby" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Promote standby" }).click();
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("Promoted P5-11, replaced P5-10");
  await expect(page.getByText(/Ready to start/)).toBeVisible();
  await ctx.close();
});

test("waiting room and access states (before the organizer starts the clock)", async ({ browser }) => {
  const a = await team(browser, "P5-01");
  await expect(a.page.getByRole("heading", { name: "Stand by, Finalist 01" })).toBeVisible();
  await expect(a.page.getByText(/50 minutes/)).toBeVisible();
  expect(await a.page.content()).not.toMatch(/E-10\d|C-08|AI-REPORT/);
  expect((await a.page.request.post("/api/round2/admin", { data: { action: "start" }, headers: { origin } })).status()).toBe(401); // team controls cannot start the round
  await shot(a.page, "waiting-room");
  const standby = await team(browser, "P5-12"), outsider = await team(browser, "P5-13"), withdrawn = await team(browser, "P5-10");
  await expect(standby.page.getByRole("heading", { name: "You are on standby" })).toBeVisible();
  await expect(outsider.page.getByRole("heading", { name: /confirmed finalists/ })).toBeVisible();
  await expect(withdrawn.page.getByRole("heading", { name: /not active in Round 2/ })).toBeVisible();
  for (const t of [standby, outsider, withdrawn]) expect((await t.page.request.get("/api/round2/evidence")).status()).toBe(403);
  await Promise.all([a, standby, outsider, withdrawn].map(t => t.ctx.close()));
});

test("organizer starts the test round through the confirmation dialog", async ({ browser }) => {
  const { ctx, page } = await organizer(browser);
  await page.getByRole("button", { name: "Start Round 2" }).click();
  await expect(page.getByRole("dialog")).toContainText("real clock");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(await prisma.r2Session.findUnique({ where: { id: 1 } })).toBeNull(); // opening and cancelling the dialog started nothing
  await page.getByRole("button", { name: "Start Round 2" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start Round 2" }).click();
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("Round 2 started at");
  await expect(page.getByText("part_a").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Round 2" })).toBeDisabled(); // cannot start twice
  expect((await page.request.post("/api/round2/admin", { data: { action: "start" }, headers: { origin } })).status()).toBe(409);
  await shot(page, "organizer-live");
  await ctx.close();
});

test("minute 0: only Incident 1 is released; scoring is partial, honest and idempotent", async ({ browser }) => {
  await atMinute(0.2);
  const { ctx, page } = await team(browser, "P5-01");
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(open(page, /Incident 2/)).toBeDisabled(); await expect(open(page, /Incident 4/)).toBeDisabled();
  await expect(page.getByRole("button", { name: /Challenge 1/ })).toBeDisabled();
  expect(await page.content()).not.toMatch(/C-08|AI-REPORT|EV-47|T-50\d/);
  const bundle = await (await page.request.get("/api/round2/evidence")).json();
  expect(bundle.units.map((u: { unit: number }) => u.unit)).toEqual([1]);
  const blob = JSON.stringify(bundle);
  expect(blob).not.toMatch(/explanation|criteria|"correct"|solution/i);
  await shot(page, "incident1-laptop");

  // realistic wrong-then-better decisions: an over-broad asset pick earns only what is safe
  const assets = task(page, "i1.assets");
  await assets.getByLabel("Account p.okafor").check(); await assets.getByLabel("Entire finance VLAN").check(); await assets.getByLabel("Laptop FIN-LT-09").check(); await assets.getByLabel("ERP production servers").check();
  await expect(assets.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await submit(page, "i1.assets").click();
  await expect(feedback(page, "i1.assets")).toContainText("No points yet"); // 4 selections forfeit per-asset credit
  await expect(assets.locator(".r2-chip", { hasText: "Attempts 1/3" })).toBeVisible(); // the counter comes from the server
  await assets.getByLabel("Entire finance VLAN").uncheck(); await assets.getByLabel("Laptop FIN-LT-09").uncheck(); await assets.getByLabel("ERP production servers").uncheck();
  await assets.getByLabel("Laptop FIN-LT-07").check();
  await waitReady(page, "i1.assets"); await submit(page, "i1.assets").click();
  await expect(feedback(page, "i1.assets")).toContainText("+3 points");
  await expect(submit(page, "i1.assets")).toHaveCount(0); // "Task complete": no submit control left
  await expect(page.locator(".r2-score")).toContainText("A 3/60");

  // incomplete forms cannot be submitted
  await expect(submit(page, "i1.classify")).toBeDisabled(); await expect(task(page, "i1.classify")).toContainText("Still needed");
  // duplicate: identical resend is free
  const resp = task(page, "i1.response");
  await resp.getByLabel(/Revoke all active sessions/).check();
  await expect(resp.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await submit(page, "i1.response").click(); await expect(feedback(page, "i1.response")).toContainText("+1 point");
  await waitReady(page, "i1.response"); await submit(page, "i1.response").click();
  await expect(feedback(page, "i1.response")).toContainText("already sent");
  await expect(resp.locator(".r2-chip", { hasText: "Attempts 1/3" })).toBeVisible(); // the identical resend consumed no attempt (tier B)
  await expect(task(page, "i1.classify").locator(".r2-chip", { hasText: "Attempts 0/2" })).toBeVisible(); // tier A
  await expect(task(page, "i1.justify").locator(".r2-chip", { hasText: "Attempts 0/5" })).toBeVisible(); // tier C
  await expect(page.locator(".r2-score")).toContainText("A 4/60");
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await ctx.close();
});

test("minute 7 and 19: incidents release by the server clock; Kill Switch map, AI audit and executive board work", async ({ browser }) => {
  await atMinute(7);
  const { ctx, page } = await team(browser, "P5-01");
  await expect(open(page, /Incident 2/)).toBeEnabled(); await expect(open(page, /Incident 3/)).toBeDisabled();
  await open(page, /Incident 2/).click();
  await expect(page.getByRole("heading", { name: "Connection map" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Queue simulated BLOCK for C-\d\d/ })).toHaveCount(10);
  await shot(page, "incident2-network-map");
  await page.getByLabel("Mark C-03 malicious").check(); await page.getByLabel("Mark C-08 malicious").check();
  await page.getByLabel("Queue simulated BLOCK for C-03").check(); await page.getByLabel("Queue simulated BLOCK for C-01").check(); // one legitimate connection blocked
  await expect(page.getByText("BLOCK C-03, BLOCK C-01")).toBeVisible(); await expect(page.getByText("Simulation only")).toBeVisible();
  await expect(task(page, "i2.identify").locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await submit(page, "i2.identify").click(); await expect(feedback(page, "i2.identify")).toContainText("+6 points");
  await waitReady(page, "i2.block"); await submit(page, "i2.block").click(); await expect(feedback(page, "i2.block")).toContainText("+1 point"); // 4 possible: the collateral block forfeits 2 and C-08 was not queued
  await expect(task(page, "i2.block")).toContainText("Partially scored");
  await page.getByLabel("Queue simulated BLOCK for C-01").uncheck();
  await waitReady(page, "i2.block"); await submit(page, "i2.block").click(); await expect(feedback(page, "i2.block")).toContainText("+2 points"); // removing the collateral block earns the rest; C-08 still unqueued

  await atMinute(19); await page.reload();
  await expect(open(page, /Incident 4/)).toBeEnabled();
  await open(page, /Incident 3/).click();
  await expect(page.getByText("UNTRUSTED · AI-GENERATED")).toBeVisible();
  await shot(page, "incident3-ai-audit");
  const v = task(page, "i3.verdicts");
  await v.getByRole("group", { name: /Claim A/ }).getByLabel("False").check(); await v.getByRole("group", { name: /Claim B/ }).getByLabel("False").check(); await v.getByRole("group", { name: /Claim C/ }).getByLabel("False").check();
  await expect(v.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await send(page, "i3.verdicts"); await expect(feedback(page, "i3.verdicts")).toContainText("New personal best: +2 points"); // B was wrongly called false
  // a worse second answer keeps the best and uses the last attempt of this tier-A task
  await v.getByRole("group", { name: /Claim A/ }).getByLabel("True").check(); await v.getByRole("group", { name: /Claim C/ }).getByLabel("True").check();
  await expect(v.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 }); await waitReady(page, "i3.verdicts"); await send(page, "i3.verdicts");
  await expect(feedback(page, "i3.verdicts")).toContainText("No improvement. Your previous best score has been retained."); await expect(feedback(page, "i3.verdicts")).toContainText("No attempts remaining. Your highest score has been saved.");
  await expect(v.getByRole("button", { name: "No attempts remaining" })).toBeDisabled(); await expect(v.locator(".r2-chip", { hasText: "Attempts 2/2" })).toBeVisible();
  await expect(page.locator(".r2-score")).toContainText("A ");
  await open(page, /Incident 4/).click();
  await expect(page.getByText("EXECUTIVE PRESSURE")).toBeVisible();
  const seq = task(page, "i4.sequence");
  await expect(submit(page, "i4.sequence")).toBeDisabled(); await expect(seq).toContainText("Not yet ordered");
  await seq.getByRole("button", { name: "Use this order as my starting point" }).click();
  await seq.getByRole("button", { name: "Move sq-4 up" }).click(); // keyboard-accessible reordering
  await waitReady(page, "i4.sequence"); await send(page, "i4.sequence"); await expect(feedback(page, "i4.sequence")).toContainText("point");
  await shot(page, "incident4-command-board");
  await ctx.close();
});

test("two teammates edit one task: no silent overwrite, honest status, explicit resolution", async ({ browser }) => {
  await atMinute(19);
  const a = await inc1(browser, "P5-02"), b = await inc1(browser, "P5-02");
  const ta = task(a.page, "i1.assets"), tb = task(b.page, "i1.assets");
  await expect(tb).toBeVisible();
  await ta.getByLabel("Account p.okafor").check();
  await expect(ta.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await tb.getByLabel("Laptop FIN-LT-07").check(); // teammate B never saw A's save
  await expect(tb.getByRole("alert")).toContainText("A teammate saved a newer draft", { timeout: 10_000 });
  await expect(tb.locator(".r2-draft")).not.toHaveText("Draft saved");
  const server = await prisma.r2Draft.findUnique({ where: { teamId_taskId: { teamId: "P5-02", taskId: "i1.assets" } } });
  expect(JSON.parse(server!.data)).toEqual({ assets: ["as-12"] }); // A's version is untouched until someone chooses
  await tb.getByRole("button", { name: /Use the teammate/ }).click();
  await expect(tb.getByLabel("Account p.okafor")).toBeChecked(); await expect(tb.getByLabel("Laptop FIN-LT-07")).not.toBeChecked();
  await tb.getByLabel("Laptop FIN-LT-07").check(); await expect(tb.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  // A is now stale: choose "keep mine" explicitly
  await ta.getByLabel("Laptop FIN-LT-09").check();
  await expect(ta.getByRole("alert")).toContainText("newer draft", { timeout: 10_000 });
  await ta.getByRole("button", { name: /Keep mine/ }).click();
  await expect(ta.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  expect(JSON.parse((await prisma.r2Draft.findUnique({ where: { teamId_taskId: { teamId: "P5-02", taskId: "i1.assets" } } }))!.data).assets.sort()).toEqual(["as-12", "as-31"]);
  expect(await prisma.r2TaskScore.count({ where: { teamId: "P5-02" } })).toBe(0); // saving drafts never scores
  // restoration after logout/login and in a fresh session
  const c = await inc1(browser, "P5-02");
  await expect(task(c.page, "i1.assets").getByLabel("Laptop FIN-LT-09")).toBeChecked();
  await Promise.all([a, b, c].map(t => t.ctx.close()));
});

test("offline edits are never reported as saved; they save when the connection returns", async ({ browser }) => {
  await atMinute(19);
  const { ctx, page } = await inc1(browser, "P5-03");
  const t = task(page, "i1.assets");
  await expect(t).toBeVisible();
  await ctx.setOffline(true);
  await t.getByLabel("Account p.okafor").check();
  await expect(t.locator(".r2-draft")).toContainText(/Offline|Save failed|Unsaved/, { timeout: 10_000 });
  await expect(t.locator(".r2-draft")).not.toHaveText("Draft saved");
  await ctx.setOffline(false);
  await t.getByLabel("Laptop FIN-LT-07").check();
  await expect(t.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 15_000 });
  expect(JSON.parse((await prisma.r2Draft.findUniqueOrThrow({ where: { teamId_taskId: { teamId: "P5-03", taskId: "i1.assets" } } })).data).assets.sort()).toEqual(["as-12", "as-27"]);
  await ctx.close();
});

test("navigating to another incident flushes a pending draft", async ({ browser }) => {
  await atMinute(19);
  const { ctx, page } = await inc1(browser, "P5-04");
  await task(page, "i1.justify").getByLabel(/E-102/).check();
  await open(page, /Incident 2/).click(); // inside the 900 ms debounce window
  await expect.poll(async () => (await prisma.r2Draft.findUnique({ where: { teamId_taskId: { teamId: "P5-04", taskId: "i1.justify" } } }))?.data ?? "", { timeout: 10_000 }).toContain("E-102");
  await ctx.close();
});

test("minute 26: Part A is read-only, the Digital Tribunal is open and usable", async ({ browser }) => {
  await atMinute(26);
  const { ctx, page } = await team(browser, "P5-01");
  await expect(page.getByText(/Part B · Digital Tribunal/).first()).toBeVisible();
  await open(page, /Incident 1/).click();
  await expect(task(page, "i1.classify").getByRole("button", { name: /Submit task/ })).toBeDisabled();
  await expect(task(page, "i1.classify")).toContainText("Closed: read-only");
  expect((await page.request.post("/api/round2/submit", { data: { taskId: "i1.assets", answer: { assets: ["as-12"] } }, headers: { origin } })).status()).toBe(403);
  await open(page, /Challenge 1/).click();
  await expect(page.getByText("Events by source clock")).toBeVisible();
  await shot(page, "tribunal-reconstruct");
  const chain = task(page, "b1.chain"); // realistic mistake: pick everything
  for (const id of ["EV-47", "EV-18", "EV-63", "EV-32", "EV-75", "EV-21", "EV-56", "EV-84", "EV-39", "EV-92", "EV-14"]) await chain.getByLabel(new RegExp(id)).check();
  await expect(chain.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await submit(page, "b1.chain").click(); await expect(feedback(page, "b1.chain")).toContainText("+1 point"); // complete, but not clean
  await open(page, /Challenge 2/).click(); await expect(page.getByRole("heading", { name: /Evidence links/ })).toBeVisible();
  await task(page, "b2.best").getByRole("group", { name: /explanation the evidence supports/i }).getByLabel(/H4/).check();
  await shot(page, "tribunal-hypotheses");
  await open(page, /Challenge 3/).click(); await expect(page.getByText("Bulletin claims vs. retained evidence")).toBeVisible();
  const ver = task(page, "b3.verify"); // the team chooses which bulletin items to refute: nothing names INT-2/4/5 for them
  expect(await ver.textContent()).not.toMatch(/INT-2, INT-4/);
  await ver.getByRole("combobox", { name: /^Add an item/ }).selectOption("INT-2");
  await ver.getByLabel(/E-105/).first().check();
  await expect(ver.locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await submit(page, "b3.verify").click(); await expect(feedback(page, "b3.verify")).toContainText("+1 point");
  await open(page, /Challenge 4/).click(); await expect(page.getByRole("heading", { name: "Command brief preview" })).toBeVisible();
  const plan = task(page, "b4.plan");
  await plan.getByLabel(/Keep FIN-LT-07 isolated, block the three/).check(); await plan.getByLabel(/Image memory then disk/).check(); await plan.getByLabel(/Restore only after credentials/).check();
  await expect(page.locator(".r2-report")).toContainText("Keep FIN-LT-07 isolated");
  await submit(page, "b4.plan").click(); await expect(feedback(page, "b4.plan")).toContainText("+3 points");
  await shot(page, "tribunal-command-brief");
  await ctx.close();
});

test("a late submission is refused by the server even with a stale tab", async ({ browser }) => {
  await atMinute(24);
  const { ctx, page } = await inc1(browser, "P5-05");
  await expect(task(page, "i1.assets")).toBeVisible();
  await task(page, "i1.assets").getByLabel("Account p.okafor").check();
  await expect(task(page, "i1.assets").locator(".r2-draft")).toHaveText("Draft saved", { timeout: 10_000 });
  await atMinute(26); // the deadline passes while the tab still believes Part A is open
  await submit(page, "i1.assets").click();
  await expect(feedback(page, "i1.assets")).toContainText(/closed/i);
  expect(await prisma.r2TaskScore.count({ where: { teamId: "P5-05" } })).toBe(0);
  await ctx.close();
});

test("minute 51: finished; own score visible, nothing writable, rankings private", async ({ browser }) => {
  await atMinute(51);
  const { ctx, page } = await team(browser, "P5-01");
  await expect(page.getByRole("heading", { name: /Finalist 01: \d+ \/ 100/ })).toBeVisible();
  await expect(page.getByText(/private until the organizers review and publish/)).toBeVisible();
  await expect(page.getByRole("table", { name: "Published results" })).toHaveCount(0);
  expect((await page.request.get("/api/round2/results")).status()).toBe(404);
  expect((await page.request.put("/api/round2/drafts", { data: { taskId: "b4.plan", data: { x: 1 }, baseVersion: 0 }, headers: { origin } })).status()).toBe(403);
  await shot(page, "finished-private");
  await ctx.close();
});

test("organizer: end/publish rules, FINAL tiebreakers, exact-tie acknowledgment gating, CSV, participant ranking", async ({ browser }) => {
  // Fixture (server-recorded values, written directly to the disposable DB): Finalist 07 and 08 are equal on total (3), Part B (0) and Part A time;
  // only Finalist 07 earned its points on a frozen difficult task (i1.justify). Criterion 4 must separate them: 07 above 08, different ranks, no tie.
  const at = new Date(Date.now() - 20 * 60_000);
  await prisma.r2TaskScore.createMany({ data: [{ teamId: "P5-07", taskId: "i1.justify", part: "A", earned: 3, max: 3, criteria: "[]", firstScoredAt: at, lastAwardAt: at }, { teamId: "P5-08", taskId: "i1.response", part: "A", earned: 3, max: 3, criteria: "[]", firstScoredAt: at, lastAwardAt: at }] });
  const { ctx, page } = await organizer(browser);
  expect((await page.request.post("/api/round2/admin", { data: { action: "end", reason: "nothing is running" }, headers: { origin } })).status()).toBe(409);
  await expect(page.getByRole("heading", { name: /G · Results review/ })).toBeVisible();
  await expect(page.getByText(/Tiebreak order: total, then Part B, then Part A completion, then difficulty subtotal/)).toBeVisible();
  const rows = page.locator("#res-h").locator("xpath=ancestor::section").getByRole("row");
  const order = (await rows.allInnerTexts()).map(r => r.replace(/\s+/g, " "));
  const i7 = order.findIndex(r => r.includes("Finalist 07")), i8 = order.findIndex(r => r.includes("Finalist 08"));
  expect(i7).toBeGreaterThan(0); expect(i7).toBeLessThan(i8); expect(order[i7]).toMatch(/Finalist 07.*\b3\b.*3\/22/); expect(order[i8]).toMatch(/0\/22/); // difficulty shown, total unchanged
  expect(order[i7]).not.toContain("TIE"); expect(order[i8]).not.toContain("TIE");
  const csvText = await (await page.request.get("/api/round2/admin?view=results-csv")).text();
  expect(csvText.indexOf("Finalist 07")).toBeLessThan(csvText.indexOf("Finalist 08")); expect(csvText).toContain("Difficulty subtotal (of 22)"); // same server order in the export
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Exact ties" })).toContainText("unacknowledged");
  const t = await team(browser, "P5-01");
  expect((await t.page.request.get("/api/round2/admin?view=solutions")).status()).toBe(401); // participants cannot read organizer data
  expect((await t.page.request.post("/api/round2/admin", { data: { action: "publish" }, headers: { origin } })).status()).toBe(401);
  expect((await t.page.request.post("/api/round2/admin", { data: { action: "acknowledge-tie", rank: 1, reason: "a participant must not be able to do this" }, headers: { origin } })).status()).toBe(401);
  await shot(page, "organizer-results");
  // publication is blocked while an exact tie is unacknowledged: in the UI and in the API
  await expect(page.getByRole("button", { name: "Publish results" })).toBeDisabled(); await expect(page.getByText("Publishing is blocked: acknowledge every exact tie first.")).toBeVisible();
  const blocked = await page.request.post("/api/round2/admin", { data: { action: "publish" }, headers: { origin } });
  expect(blocked.status()).toBe(409); expect((await blocked.json()).error).toMatch(/Exact ties must be acknowledged/);
  // acknowledge: reason required (10-500), confirmation dialog, shared rank preserved
  const ties = page.getByRole("region", { name: "Exact ties" }), ack = ties.getByRole("button", { name: "Acknowledge exact tie" }).first();
  await expect(ack).toBeDisabled();
  await ties.getByLabel(/Reason for acknowledging/).fill("too short"); await expect(ack).toBeDisabled();
  await ties.getByLabel(/Reason for acknowledging/).fill("Exact tie reviewed; the shared rank is accepted for the final ranking");
  await ack.click(); await expect(page.getByRole("dialog")).toContainText("cannot select a winner");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await (await page.request.get("/api/round2/admin?view=results")).json()).unacknowledgedTies).toBeGreaterThan(0); // cancelling recorded nothing
  while (await ties.getByRole("button", { name: "Acknowledge exact tie" }).count()) {
    await ties.getByRole("button", { name: "Acknowledge exact tie" }).first().dispatchEvent("click"); // dev-server re-renders can detach the node mid-pointer-click; the handler is what matters
    await page.getByRole("dialog").getByRole("button", { name: "Acknowledge exact tie" }).dispatchEvent("click"); // the control unmounts as soon as the server confirms, so a pointer click would race its own detachment
    await expect(page.locator(".r2a-msg.is-ok")).toContainText("acknowledged");
  }
  await expect(ties).toContainText("Acknowledged: Exact tie reviewed");
  const after = (await rows.allInnerTexts()).map(r => r.replace(/\s+/g, " ")); expect(after.length).toBe(order.length); expect(after.findIndex(r => r.includes("Finalist 07"))).toBe(i7); // acknowledgment reorders and rescores nothing
  expect(await (await page.request.get("/api/round2/admin?view=results-csv")).text()).toContain("shared rank is accepted"); // the CSV carries the recorded acknowledgment
  // now the normal confirmed publication
  await page.getByRole("button", { name: "Publish results" }).click();
  await expect(page.getByRole("dialog")).toContainText("irreversible");
  await expect(page.getByRole("dialog").getByRole("button", { name: "Publish results" })).toBeDisabled(); // needs the typed word
  await page.getByRole("dialog").getByLabel(/Type PUBLISH/).fill("PUBLISH");
  await page.getByRole("dialog").getByRole("button", { name: "Publish results" }).click();
  await expect(page.locator(".r2a-msg.is-ok")).toContainText("Results published");
  await t.page.reload();
  const table = t.page.getByRole("table", { name: "Published results" });
  await expect(table).toBeVisible(); await expect(table.getByRole("row")).toHaveCount(11); // header + 10 active finalists; the withdrawn team is not ranked
  await expect(table).not.toContainText("Finalist 10");
  await expect(table).toContainText("shared rank, exact tie acknowledged");
  const pub = (await table.getByRole("row").allInnerTexts()).map(r => r.replace(/\s+/g, " "));
  expect(pub.findIndex(r => r.includes("Finalist 07"))).toBeLessThan(pub.findIndex(r => r.includes("Finalist 08"))); // same server order for participants
  await expect(t.page.getByText(/Tiebreak: difficult tasks/)).toBeVisible();
  await shot(t.page, "published-results");
  await t.ctx.close(); await ctx.close();
});

test("Round 2 stylesheet really loads on the participant route and layouts do not overflow (laptop, tablet, phone)", async ({ browser }) => {
  for (const [name, vp] of [["laptop", { width: 1366, height: 800 }], ["tablet", { width: 820, height: 1100 }], ["phone", { width: 390, height: 844 }]] as const) {
    await atMinute(10);
    const { ctx, page } = await team(browser, "P5-06", vp);
    await expect(page.getByRole("navigation", { name: "Incidents and challenges" })).toBeVisible({ timeout: 30_000 });
    const css = await page.evaluate(() => { const top = document.querySelector(".r2-top"), nav = document.querySelector(".r2-nav"); return { top: top ? getComputedStyle(top).display : null, bg: top ? getComputedStyle(top).backgroundColor : null, nav: nav ? getComputedStyle(nav).position : null }; });
    expect(["grid", "flex"]).toContain(css.top); expect(css.bg).not.toBe("rgba(0, 0, 0, 0)"); expect(css.nav).toBe("sticky");
    expect(await overflow(page), `${name} overflow`).toBeLessThanOrEqual(1);
    await open(page, /Incident 2/).click(); await expect(page.getByRole("heading", { name: "Connection map" })).toBeVisible();
    expect(await overflow(page), `${name} incident 2 overflow`).toBeLessThanOrEqual(1);
    await shot(page, `${name}-incident2`);
    await open(page, /Incident 1/).click(); await shot(page, `${name}-incident1`);
    await ctx.close();
  }
  const { ctx, page } = await organizer(browser); await page.setViewportSize({ width: 390, height: 844 });
  expect(await overflow(page), "organizer phone overflow").toBeLessThanOrEqual(60); await shot(page, "phone-organizer"); await ctx.close();
});
