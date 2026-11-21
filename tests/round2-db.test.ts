import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";
import { perfect } from "./fixtures/round2";

// Disposable local PostgreSQL only (scripts/pg-temp.mjs refuses non-local hosts). Opt in with GHOST_DB_TEST=1.
// STATUS: authored but NOT executed in the storage-limited Phase 3 pass (no disposable PostgreSQL was available).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

const min = (m: number) => m * 60_000;
describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 2 backend (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let auth: typeof import("../src/lib/auth");
  let enroll: typeof import("../src/lib/round2/enrollment.server");
  let play: typeof import("../src/lib/round2/play.server");
  let org: typeof import("../src/lib/round2/organizer.server");
  let submitRoute: typeof import("../src/app/api/round2/submit/route");
  let draftRoute: typeof import("../src/app/api/round2/drafts/route");
  let adminRoute: typeof import("../src/app/api/round2/admin/route");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 14 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
  const post = (path: string, body: unknown) => new NextRequest(`${origin}${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const put = (path: string, body: unknown) => new NextRequest(`${origin}${path}`, { method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const asTeam = async (id: string) => { await auth.logout("team"); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const ago = (ms: number) => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms) }, update: { startsAt: new Date(Date.now() - ms), endedAt: null } });
  const gap = () => db.r2Submission.updateMany({ data: { createdAt: new Date(0) } }); // the 3 s cooldown is real; tests age history instead of sleeping

  beforeAll(async () => {
    temp = await createTempDatabase("round2");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth");
    enroll = await import("../src/lib/round2/enrollment.server"); play = await import("../src/lib/round2/play.server"); org = await import("../src/lib/round2/organizer.server");
    submitRoute = await import("../src/app/api/round2/submit/route"); draftRoute = await import("../src/app/api/round2/drafts/route"); adminRoute = await import("../src/app/api/round2/admin/route");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("organizer-only: no session and team sessions are refused; enrollment fails clearly without a confirmed qualification", async () => {
    await expect(enroll.enrollFinalists()).rejects.toMatchObject({ status: 401 });
    await asTeam("R01"); await expect(enroll.readiness()).rejects.toMatchObject({ status: 401 });
    expect((await adminRoute.GET(new NextRequest(`${origin}/api/round2/admin?view=solutions`))).status).toBe(401);
    await asAdmin();
    await expect(enroll.enrollFinalists()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("not been confirmed") });
    expect((await enroll.readiness().catch(() => null))?.ready).toBe(false);
    await expect(org.startRound()).rejects.toMatchObject({ status: 409, extra: { checks: expect.arrayContaining(["qualification-confirmed"]) } }); // start is blocked while not ready
    await expect(org.endRound("nothing is running")).rejects.toMatchObject({ status: 409 });
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toBeNull(); // a refused start leaves no clock behind
  });
  it("enrolls exactly 10 active + 2 standby from the confirmed snapshot, idempotently, never from a live leaderboard", async () => {
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "digest-0001", top10: ids.slice(0, 10), standby: ids.slice(10, 12), reason: "test" }) } });
    expect(await enroll.enrollFinalists()).toMatchObject({ enrolled: 12, unchanged: false });
    expect(await enroll.enrollFinalists()).toMatchObject({ unchanged: true });
    expect(await db.r2Finalist.count({ where: { status: "active" } })).toBe(10); expect(await db.r2Finalist.count({ where: { status: "standby" } })).toBe(2);
    expect((await db.r2Finalist.findUnique({ where: { teamId: "R13" } }))).toBeNull(); // not in the snapshot => never enrolled
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "digest-0002", top10: ids.slice(0, 9), standby: [], reason: "x" }) } });
    await expect(enroll.enrollFinalists()).rejects.toMatchObject({ status: 409 }); // different snapshot: roster changes go through promotion
    await db.auditLog.deleteMany({ where: { detail: { contains: "digest-0002" } } });
  });
  it("standby promotion needs a reason and a replacement while 10 are active; all changes are audited", async () => {
    await expect(enroll.promoteStandby({ standbyTeamId: "R11", reason: "no" })).rejects.toMatchObject({ status: 400 });
    await expect(enroll.promoteStandby({ standbyTeamId: "R11", reason: "Team R10 withdrew" })).rejects.toMatchObject({ status: 409 }); // 10 active, no replacement named
    await expect(enroll.promoteStandby({ standbyTeamId: "R01", replacesTeamId: "R10", reason: "not a standby team" })).rejects.toMatchObject({ status: 409 });
    expect(await enroll.promoteStandby({ standbyTeamId: "R11", replacesTeamId: "R10", reason: "Team R10 withdrew" })).toEqual({ promoted: "R11", replaced: "R10" });
    expect(await db.r2Finalist.count({ where: { status: "active" } })).toBe(10);
    expect(await db.r2Audit.count({ where: { action: "promote-standby" } })).toBe(1);
    await expect(enroll.promoteStandby({ standbyTeamId: "R12", replacesTeamId: "R10", reason: "R10 is already withdrawn" })).rejects.toMatchObject({ status: 409 });
  });
  it("nothing is accessible before the organizer starts the clock; the clock never starts by itself", async () => {
    await asTeam("R01");
    const status = await play.r2Status("R01"); expect(status.clock.phase).toBe("not_started");
    expect((await play.r2Bundle()).units).toEqual([]);
    expect((await submitRoute.POST(post("/api/round2/submit", { taskId: "i1.assets", answer: perfect["i1.assets"] }))).status).toBe(403);
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toBeNull();
  });
  it("start requires readiness, is audited, and cannot be repeated", async () => {
    await asAdmin();
    const started = await org.startRound();
    expect(started.partAClosesAt.getTime() - started.startsAt.getTime()).toBe(min(25));
    expect(await db.r2Audit.count({ where: { action: "start" } })).toBe(1);
    await expect(org.startRound()).rejects.toMatchObject({ status: 409 });
    await expect(enroll.enrollFinalists()).rejects.toMatchObject({ status: 409 }); // roster frozen from the same snapshot only before start
  });
  it("releases incidents on the server schedule and hides unreleased content", async () => {
    await asTeam("R01");
    let bundle = await play.r2Bundle(); expect(bundle.units.map(u => u.unit)).toEqual([1]);
    expect(JSON.stringify(bundle)).not.toContain("C-08"); expect(JSON.stringify(bundle)).not.toContain("AI-REPORT");
    await ago(min(7)); bundle = await play.r2Bundle(); expect(bundle.units.map(u => u.unit)).toEqual([1, 2]);
    const early = await submitRoute.POST(post("/api/round2/submit", { taskId: "i3.verdicts", answer: perfect["i3.verdicts"] }));
    expect(early.status).toBe(403); expect((await early.json()).error).toMatch(/not been released/);
    await ago(min(19)); expect((await play.r2Bundle()).units.map(u => u.unit)).toEqual([1, 2, 3, 4]);
    expect((await play.r2Bundle()).units.some(u => u.part === "B")).toBe(false);
  });
  it("task scoring: partial credit, idempotent duplicates, no duplicate awards, no client scores", async () => {
    await ago(min(19)); await asTeam("R01");
    const partial = await play.submitTask("R01", "i1.assets", { assets: ["as-12", "as-27", "as-63"] });
    expect(partial).toMatchObject({ awarded: 2, duplicate: false, task: { earned: 2, max: 3 } });
    expect(await play.submitTask("R01", "i1.assets", { assets: ["as-12", "as-27", "as-63"] })).toMatchObject({ awarded: 0, duplicate: true }); // identical resubmission is free and idempotent
    await gap();
    const improved = await play.submitTask("R01", "i1.assets", perfect["i1.assets"]);
    expect(improved).toMatchObject({ awarded: 1, task: { earned: 3, max: 3 } });
    await gap();
    const worse = await play.submitTask("R01", "i1.assets", { assets: ["as-63"] }).catch(e => e);
    expect(worse).toMatchObject({ status: 409 }); // task already complete: nothing can lower it
    expect((await play.r2Status("R01")).score.partA).toBe(3);
    const withScore = await submitRoute.POST(post("/api/round2/submit", { taskId: "i1.response", answer: perfect["i1.response"], score: 15 }));
    expect(withScore.status).toBe(400); expect(await db.r2TaskScore.count({ where: { teamId: "R01", taskId: "i1.response" } })).toBe(0);
    const body = JSON.stringify(await (await submitRoute.POST(post("/api/round2/submit", { taskId: "i1.response", answer: perfect["i1.response"] }))).json());
    expect(body).not.toContain("criteria"); expect(body).not.toContain("rx-2");
  });
  it("concurrent identical submissions award exactly once", async () => {
    await ago(min(19)); await gap();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => play.submitTask("R02", "i2.block", perfect["i2.block"])));
    const ok = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<{ awarded: number }>).value);
    expect(ok.reduce((n, r) => n + r.awarded, 0)).toBe(4);
    expect((await db.r2TaskScore.findUnique({ where: { teamId_taskId: { teamId: "R02", taskId: "i2.block" } } }))?.earned).toBe(4);
  });
  it("attempt cap and cooldown limit brute forcing", async () => {
    await ago(min(19)); await gap();
    await expect(play.submitTask("R03", "i2.identify", { connectionIds: ["C-01"] })).resolves.toMatchObject({ awarded: 0 });
    await expect(play.submitTask("R03", "i2.identify", { connectionIds: ["C-02"] })).rejects.toMatchObject({ status: 429, extra: { retryAfter: expect.any(Number) } });
    const ids = ["C-01", "C-02", "C-04", "C-05", "C-06", "C-07", "C-09", "C-10"], pairs = ids.flatMap((a, i) => ids.slice(i + 1).map(b => [a, b])); // never the real pair, so the task cannot complete
    for (const pair of pairs.slice(0, 10)) { await gap(); await expect(play.submitTask("R03", "i2.identify", { connectionIds: pair })).resolves.toMatchObject({ awarded: 0 }); } // attempts 3..12 (cooldown attempt above was refused, not graded)
    expect(await db.r2Submission.count({ where: { teamId: "R03", taskId: "i2.identify" } })).toBe(11);
    await gap(); await expect(play.submitTask("R03", "i2.identify", { connectionIds: pairs[10] })).resolves.toMatchObject({ awarded: 0 }); // 12th
    await gap(); await expect(play.submitTask("R03", "i2.identify", { connectionIds: pairs[11] })).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Attempt limit") });
    await gap(); await expect(play.submitTask("R03", "i2.identify", { connectionIds: pairs[0] })).resolves.toMatchObject({ duplicate: true }); // an identical resend is still free at the cap
  });
  it("teams cannot touch each other's data and non-finalists are refused", async () => {
    await asTeam("R13"); expect((await submitRoute.POST(post("/api/round2/submit", { taskId: "i1.assets", answer: perfect["i1.assets"] }))).status).toBe(403);
    await asTeam("R10"); expect((await draftRoute.GET()).status).toBe(403); // withdrawn
    await asTeam("R04");
    await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { assets: ["as-12"] }, baseVersion: 0 }));
    await asTeam("R05");
    expect((await (await draftRoute.GET()).json()).drafts).toEqual([]);
    const spoof = await submitRoute.POST(post("/api/round2/submit", { teamId: "R04", taskId: "i1.assets", answer: perfect["i1.assets"] }));
    expect(spoof.status).toBe(400); expect(await db.r2TaskScore.count({ where: { teamId: "R04" } })).toBe(0);
  });
  it("drafts: compare-and-set conflicts, size/prototype limits, unreleased tasks, no points", async () => {
    await ago(min(19)); await asTeam("R06");
    const first = await (await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { assets: ["as-12"] }, baseVersion: 0 }))).json();
    expect(first.version).toBe(1);
    const stale = await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { assets: [] }, baseVersion: 0 }));
    expect(stale.status).toBe(409); expect((await stale.json()).current.version).toBe(1);
    expect((await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { assets: ["as-27"] }, baseVersion: 1 }))).status).toBe(200);
    expect((await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { big: "x".repeat(9000) }, baseVersion: 2 }))).status).toBeGreaterThanOrEqual(400);
    const raw = new NextRequest(`${origin}/api/round2/drafts`, { method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: '{"taskId":"i1.assets","data":{"__proto__":{"x":1}},"baseVersion":2}' });
    expect((await draftRoute.PUT(raw)).status).toBe(400);
    expect((await draftRoute.PUT(put("/api/round2/drafts", { taskId: "b1.chain", data: { eventIds: [] }, baseVersion: 0 }))).status).toBe(403); // Part B not open
    expect(await db.r2TaskScore.count({ where: { teamId: "R06" } })).toBe(0);
  });
  it("standby and withdrawn teams cannot play; a started roster only changes for a team with no submissions", async () => {
    await ago(min(19)); await asTeam("R12"); // still standby
    expect((await draftRoute.GET()).status).toBe(403);
    expect((await submitRoute.POST(post("/api/round2/submit", { taskId: "i1.assets", answer: perfect["i1.assets"] }))).status).toBe(403);
    await asAdmin();
    await expect(enroll.promoteStandby({ standbyTeamId: "R12", replacesTeamId: "R01", reason: "R01 has already submitted" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already submitted") });
    expect((await db.r2Finalist.findUniqueOrThrow({ where: { teamId: "R01" } })).status).toBe("active");
    expect(await enroll.promoteStandby({ standbyTeamId: "R12", replacesTeamId: "R09", reason: "R09 never joined" })).toEqual({ promoted: "R12", replaced: "R09" });
    await asTeam("R12"); expect((await draftRoute.GET()).status).toBe(200);
    await asTeam("R09"); expect((await draftRoute.GET()).status).toBe(403);
  });
  it("deadline race: submissions racing the organizer's end never land after the end", async () => {
    await ago(min(19)); await gap(); await asAdmin();
    const submits = Promise.allSettled(Array.from({ length: 8 }, (_, i) => play.submitTask("R08", "i4.contain", { actions: i % 2 ? ["kx-1"] : ["kx-3"] })));
    await new Promise(r => setTimeout(r, 15));
    await org.endRound("race test");
    await submits;
    const end = (await db.r2Session.findUniqueOrThrow({ where: { id: 1 } })).endedAt!;
    expect(await db.r2Submission.count({ where: { createdAt: { gt: end } } })).toBe(0);
    await db.r2Session.update({ where: { id: 1 }, data: { endedAt: null } }); // reopen the disposable clock for the following tests
    await gap();
  });
  it("Part A closes at minute 25, Part B opens, and Part B closes at minute 50", async () => {
    await ago(min(25) + 1000); await asTeam("R07"); await gap();
    await expect(play.submitTask("R07", "i1.assets", perfect["i1.assets"])).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/closed/) });
    expect((await draftRoute.PUT(put("/api/round2/drafts", { taskId: "i1.assets", data: { a: 1 }, baseVersion: 0 }))).status).toBe(403); // read-only
    expect((await play.r2Bundle()).units.map(u => u.part)).toContain("B");
    expect(await play.submitTask("R07", "b4.plan", perfect["b4.plan"])).toMatchObject({ awarded: 3 });
    await ago(min(50) + 1000); await gap();
    await expect(play.submitTask("R07", "b4.comms", perfect["b4.comms"])).rejects.toMatchObject({ status: 403 });
    expect((await play.r2Status("R07")).clock.phase).toBe("finished");
  });
  it("survives a server restart: the clock is recomputed from the persisted row", async () => {
    await ago(min(30)); vi.resetModules();
    const fresh = await import("../src/lib/round2/play.server");
    expect((await fresh.r2Status("R07")).clock.phase).toBe("part_b");
  });
  it("results stay private until the organizer ends the round and explicitly publishes", async () => {
    await ago(min(30)); await asAdmin();
    await expect(org.reviewResults()).rejects.toMatchObject({ status: 409 });
    await expect(org.publishResults()).rejects.toMatchObject({ status: 409 });
    await org.endRound("Test finish");
    await expect(org.endRound("again")).rejects.toMatchObject({ status: 409 });
    await asTeam("R01"); expect((await (await import("../src/app/api/round2/results/route")).GET()).status).toBe(404);
    await asAdmin();
    const review = await org.reviewResults();
    expect(review.max).toEqual({ partA: 60, partB: 40, total: 100 }); expect(review.ranked[0].rank).toBe(1);
    expect(review.tiesNeedAdjudication).toBe(true); expect(review.ranked.some(r => r.tie)).toBe(true); // several teams scored nothing: shared rank, flagged, no winner invented
    expect(review.ranked.every((r, i, all) => i === 0 || all[i - 1].total >= r.total)).toBe(true);
    expect(review.withdrawn.map(w => w.teamId).sort()).toEqual(["R09", "R10"]);
    const csv = await org.resultsCsv(); expect(csv).toContain("Part A completion ms"); expect(csv).toContain("TIE");
    expect((await org.publishResults()).already).toBe(false); expect((await org.publishResults()).already).toBe(true);
    await asTeam("R01"); expect((await (await import("../src/app/api/round2/results/route")).GET()).status).toBe(200);
    expect(await db.r2Audit.count({ where: { action: "publish-results" } })).toBe(1);
  });
  it("Round 1 data is untouched by every Round 2 operation", async () => {
    const p = await db.team.findMany({ select: { id: true, progress: true } });
    expect(p.every(t => t.progress === JSON.stringify(initialProgress()))).toBe(true);
    expect(await db.submission.count()).toBe(0); expect(await db.taskScore.count()).toBe(0); expect(await db.chapterDraft.count()).toBe(0);
    const r1 = await db.gameSession.findUniqueOrThrow({ where: { id: 1 } }); expect(r1.deadline!.getTime()).toBeLessThan(Date.now());
  });
});
