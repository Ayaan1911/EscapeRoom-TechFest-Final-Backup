import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolve } from "node:path";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Round 1 -> Top 10 -> Round 2 advancement, eligibility enforcement and idempotency. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Top 10 advancement (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), q: typeof import("../src/lib/game/qualification.server"), svc: typeof import("../src/lib/game/service");
  let statusRoute: typeof import("../src/app/api/round2/status/route"), termRoute: typeof import("../src/app/api/round2/terminal/route"), adminRoute: typeof import("../src/app/api/round2/admin/route");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 14 }, (_, i) => `A${String(i + 1).padStart(2, "0")}`);
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const req = (method: string, path: string, body?: unknown) => new NextRequest(`${origin}${path}`, { method, headers: { origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  /** Distinct descending scores by default (A01 highest). `tie` makes ranks 9-12 equal (2 places for 4 teams). */
  async function seed(opts: { tie?: boolean; open?: boolean } = {}) {
    await db.r2BlockAttempt.deleteMany(); await db.r2PaperMark.deleteMany(); await db.r2Finalist.deleteMany(); await db.r2Session.deleteMany(); await db.r2Audit.deleteMany(); await db.auditLog.deleteMany(); await db.gameSession.deleteMany();
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - (opts.open ? 600_000 : 7_200_000)), deadline: new Date(Date.now() + (opts.open ? 3_000_000 : -3_600_000)) } });
    for (const [i, id] of ids.entries()) { const p = initialProgress(); p.chapters[0].score = opts.tie && i >= 8 && i < 12 ? 17 : Math.max(0, 25 - i); await db.team.update({ where: { id }, data: { progress: JSON.stringify(p) } }); }
  }
  const teamsSnapshot = async () => JSON.stringify(await db.team.findMany({ select: { id: true, progress: true, name: true, codeHash: true }, orderBy: { id: "asc" } }));
  const confirmations = () => db.auditLog.count({ where: { actor: "organizer", action: "qualification-confirmed" } });

  beforeAll(async () => {
    temp = await createTempDatabase("advance");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json");
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); q = await import("../src/lib/game/qualification.server"); svc = await import("../src/lib/game/service");
    statusRoute = await import("../src/app/api/round2/status/route"); termRoute = await import("../src/app/api/round2/terminal/route"); adminRoute = await import("../src/app/api/round2/admin/route");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("cannot advance while Round 1 is still open, and nobody but an organizer can advance", async () => {
    await seed({ open: true }); await asAdmin();
    await expect(q.advanceTopTen({ reason: "too early for this" })).rejects.toMatchObject({ kind: "round-open" });
    await auth.logout(); await expect(q.advanceTopTen({ reason: "no session here" })).rejects.toMatchObject({ kind: "auth" });
    await asTeam("A01"); await expect(q.advanceTopTen({ reason: "a team tries it" })).rejects.toMatchObject({ kind: "auth" });
    expect(await confirmations()).toBe(0); expect(await db.r2Finalist.count()).toBe(0);
  });

  it("ranks by the saved score, confirms exactly the Top 10 + 2 standby, enrolls them, and never starts Round 2 or touches scores", async () => {
    await seed(); await asAdmin();
    const report = (await q.qualificationReport())!; expect(report.rows.slice(0, 3).map(r => r.id)).toEqual(["A01", "A02", "A03"]);
    const before = await teamsSnapshot();
    await expect(q.advanceTopTen({ reason: "ok" })).rejects.toMatchObject({ kind: "reason" });
    const res = await q.advanceTopTen({ reason: "Reviewed the final Round 1 standings" });
    expect(res.unchanged).toBe(false); expect(res.top10).toEqual(ids.slice(0, 10)); expect(res.standby).toEqual(["A11", "A12"]); expect(res.tie).toBeNull(); expect(res.enrolled).toBe(12);
    const f = await db.r2Finalist.findMany({ orderBy: { seed: "asc" } });
    expect(f.filter(x => x.status === "active").map(x => x.teamId)).toEqual(ids.slice(0, 10)); expect(f.filter(x => x.status === "standby").map(x => x.teamId)).toEqual(["A11", "A12"]);
    expect(f.map(x => x.teamId)).not.toContain("A13"); expect(f.map(x => x.teamId)).not.toContain("A14");
    expect(await db.r2Session.count()).toBe(0); // Round 2 did NOT start
    expect(await teamsSnapshot()).toBe(before); // no score, progress, name or credential changed
    const audit = await db.auditLog.findMany({ where: { action: "qualification-confirmed" } }); expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].detail)).toMatchObject({ top10: ids.slice(0, 10), advanced: true, reason: "Reviewed the final Round 1 standings" });
    expect(await db.r2Audit.count({ where: { action: "enroll" } })).toBe(1);
    expect((await (await adminRoute.GET(req("GET", "/api/round2/admin?view=readiness"))).json())).toMatchObject({ active: 10, standby: 2, confirmed: true, expected: 10 });
    expect((await (await adminRoute.GET(req("GET", "/api/round2/admin?view=timing"))).json()).phase).toBe("not_started");
  });

  it("repeat and concurrent confirmations are idempotent: one record, one enrollment, no duplicates", async () => {
    await seed(); await asAdmin();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => q.advanceTopTen({ reason: "Concurrent confirm clicks" })));
    expect(results.every(r => r.status === "fulfilled")).toBe(true);
    expect(results.filter(r => r.status === "fulfilled" && !(r as PromiseFulfilledResult<{ unchanged: boolean }>).value.unchanged)).toHaveLength(1);
    expect(await confirmations()).toBe(1); expect(await db.r2Finalist.count()).toBe(12); expect(await db.r2Audit.count({ where: { action: "enroll" } })).toBe(1);
    expect(await q.advanceTopTen({ reason: "Clicked again later" })).toMatchObject({ unchanged: true }); expect(await confirmations()).toBe(1);
  });

  it("a tie across 10th place is refused until the organizer chooses; the choice is recorded as manual and honoured exactly", async () => {
    await seed({ tie: true }); await asAdmin();
    const rows = (await q.qualificationReport())!.rows; expect(rows.slice(8, 12).map(r => r.total)).toEqual([17, 17, 17, 17]);
    await expect(q.advanceTopTen({ reason: "Trying without a choice" })).rejects.toMatchObject({ kind: "tie-unresolved" });
    expect(await confirmations()).toBe(0); expect(await db.r2Finalist.count()).toBe(0); // nothing half-saved
    await expect(q.advanceTopTen({ reason: "Only one of two places", tie: ["A10"] })).rejects.toMatchObject({ kind: "tie-invalid" });
    await expect(q.advanceTopTen({ reason: "A team outside the tie", tie: ["A10", "A13"] })).rejects.toMatchObject({ kind: "tie-invalid" });
    await expect(q.advanceTopTen({ reason: "Someone clearly ahead", tie: ["A01", "A10"] })).rejects.toMatchObject({ kind: "tie-invalid" });
    const res = await q.advanceTopTen({ reason: "Head judge decided after a re-read", tie: ["A12", "A10"] });
    expect(res.top10).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A10", "A12"]); // not A09/A11: no ID or order rule was applied
    const active = (await db.r2Finalist.findMany({ where: { status: "active" } })).map(x => x.teamId).sort(); expect(active).not.toContain("A09"); expect(active).not.toContain("A11");
    const detail = JSON.parse((await db.auditLog.findFirstOrThrow({ where: { action: "qualification-confirmed" } })).detail);
    expect(detail.tieDecision).toMatchObject({ score: 17, chosen: ["A10", "A12"], manual: true }); expect(detail.tieDecision.group).toEqual(["A09", "A10", "A11", "A12"]);
    expect(await q.advanceTopTen({ reason: "Re-submitted the same decision", tie: ["A10", "A12"] })).toMatchObject({ unchanged: true });
    await expect(q.advanceTopTen({ reason: "Trying to swap the decision", tie: ["A09", "A11"] })).rejects.toMatchObject({ kind: "conflict" }); // the recorded decision stands
    expect(await confirmations()).toBe(1);
  });

  it("a manual selection cannot override a clear ranking", async () => {
    await seed(); await asAdmin();
    await expect(q.advanceTopTen({ reason: "Swap in a lower team", tie: ["A14"] })).rejects.toMatchObject({ kind: "tie-invalid" });
    expect(await confirmations()).toBe(0);
  });

  it("cannot advance once Round 2 has started", async () => {
    await seed(); await asAdmin();
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(), format: "open-60" } });
    await expect(q.advanceTopTen({ reason: "Late advancement attempt" })).rejects.toMatchObject({ kind: "round2-started" });
    expect(await db.r2Finalist.count()).toBe(0); expect(await confirmations()).toBe(0);
  });

  it("each team sees only its own state: qualified (waiting), live, reserve, or decided-but-not-listed", async () => {
    await seed(); await asAdmin(); await q.advanceTopTen({ reason: "Reviewed the final standings" });
    expect((await svc.teamState("A01")).round2).toEqual({ decided: true, role: "finalist", phase: "not_started" });
    expect((await svc.teamState("A11")).round2).toMatchObject({ role: "standby" });
    expect((await svc.teamState("A14")).round2).toEqual({ decided: true, role: "none", phase: "not_started" });
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - 60_000), format: "open-60" } });
    expect((await svc.teamState("A01")).round2).toMatchObject({ role: "finalist", phase: "running" });
    expect((await svc.teamState("A14")).round2).toMatchObject({ role: "none", phase: "running" }); // no entry for a non-finalist even while live
    await db.r2Session.deleteMany();
  });

  it("Round 2 access is enforced on the server: non-qualified and standby teams are refused every route, qualified teams enter only when it starts", async () => {
    await seed(); await asAdmin(); await q.advanceTopTen({ reason: "Reviewed the final standings" });
    const status = async () => { const r = await statusRoute.GET(); return { code: r.status, body: await r.json() }; };
    const term = async () => (await termRoute.GET()).status;
    await auth.logout(); expect((await status()).code).toBe(401);
    for (const outsider of ["A14", "A13", "A11"]) { await asTeam(outsider); expect((await status()).code).toBe(403); expect(await term()).toBe(403); } // A11 = standby
    await asTeam("A01"); const waiting = await status(); expect(waiting.code).toBe(200); expect(waiting.body).toMatchObject({ phase: "not_started", injects: null }); // qualified, nothing opens early
    expect(await db.r2Session.count()).toBe(0);
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - 60_000), format: "open-60" } }); // the organizer's start
    const live = await status(); expect(live.code).toBe(200); expect(live.body.phase).toBe("running"); expect(live.body.injects).toHaveLength(4);
    await asTeam("A14"); expect((await status()).code).toBe(403); expect(await term()).toBe(403);
    expect((await import("../src/lib/round2/access.server").then(m => m.finalistAccess())).state).toBe("outsider");
    await db.r2Session.deleteMany();
  });

  it("the shared 60-minute round starts only from the organizer's own start action, never from confirming qualification", async () => {
    await seed(); await asAdmin(); await q.advanceTopTen({ reason: "Reviewed the final standings" });
    expect(await db.r2Session.count()).toBe(0);
    const start = await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start" })); expect(start.status).toBe(200);
    const row = await db.r2Session.findUniqueOrThrow({ where: { id: 1 } }); expect(row.format).toBe("open-60");
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start" }))).status).toBe(409); // cannot start twice
    await db.r2Session.deleteMany();
  });
});
