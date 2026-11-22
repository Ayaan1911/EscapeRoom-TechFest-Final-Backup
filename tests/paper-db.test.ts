import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// GHOST RETURNS paper edition: server-authoritative chapter access. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

const min = (m: number) => m * 60_000;
// Strings that exist ONLY in one chapter (proves the other chapters are never in a response) and strings that must never reach a participant.
const MARK = { 1: "ALR-0214", 2: "wsvc_sync.exe", 3: "CONFIDENCE", 4: "Disconnect the infected machines" } as const;
const SECRET = ["ORGANIZER ONLY", "decoy", "Rogue", "rogue", "(good)", "overconfident", "unproven promise", "Accept a clue", "verdict", "answer"];

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("GHOST RETURNS paper edition (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), enroll: typeof import("../src/lib/round2/enrollment.server"), svc: typeof import("../src/lib/round2/paper/service.server");
  let statusRoute: typeof import("../src/app/api/round2/status/route"), adminRoute: typeof import("../src/app/api/round2/admin/route");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 14 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`${origin}${path}`, { method, headers: { origin, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const ago = (ms: number) => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms) }, update: { startsAt: new Date(Date.now() - ms), endedAt: null } });
  const status = async () => { const r = await statusRoute.GET(); const body = await r.json(); return { code: r.status, body, text: JSON.stringify(body) }; };

  beforeAll(async () => {
    temp = await createTempDatabase("paper");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); enroll = await import("../src/lib/round2/enrollment.server"); svc = await import("../src/lib/round2/paper/service.server");
    statusRoute = await import("../src/app/api/round2/status/route"); adminRoute = await import("../src/app/api/round2/admin/route");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("organizer-only: anonymous and team sessions are refused; start is blocked until qualification is confirmed and finalists are enrolled", async () => {
    await auth.logout();
    await expect(svc.startPaper()).rejects.toMatchObject({ status: 401 });
    expect((await adminRoute.GET(req("GET", "/api/round2/admin?view=timing"))).status).toBe(401);
    await asTeam("R01");
    expect((await adminRoute.GET(req("GET", "/api/round2/admin?view=timing"))).status).toBe(401);
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start" }))).status).toBe(401);
    await expect(svc.endPaper("a team may not end it")).rejects.toMatchObject({ status: 401 });
    await asAdmin();
    await expect(svc.startPaper()).rejects.toMatchObject({ status: 409, extra: { checks: expect.arrayContaining(["qualification-confirmed"]) } });
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toBeNull(); // a refused start leaves no clock behind
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start" }, { origin: "http://evil.example" }))).status).toBe(403); // hostile origin
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "publish" }))).status).toBe(400); // legacy scoring actions no longer exist
  });
  it("enrolls exactly 10 active + 2 standby from the confirmed snapshot, idempotently; promotion needs a reason", async () => {
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "digest-0001", top10: ids.slice(0, 10), standby: ids.slice(10, 12), reason: "test" }) } });
    expect(await enroll.enrollFinalists()).toMatchObject({ enrolled: 12, unchanged: false });
    expect(await enroll.enrollFinalists()).toMatchObject({ unchanged: true });
    expect(await db.r2Finalist.count({ where: { status: "active" } })).toBe(10);
    await expect(enroll.promoteStandby({ standbyTeamId: "R11", reason: "no" })).rejects.toMatchObject({ status: 400 });
  });
  it("nothing is visible before the organizer starts the clock; it never starts by itself; outsiders and standby teams are refused", async () => {
    await asTeam("R01");
    const s = await status(); expect(s.code).toBe(200); expect(s.body).toMatchObject({ phase: "not_started", chapter: null });
    for (const m of Object.values(MARK)) expect(s.text).not.toContain(m);
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toBeNull();
    await asTeam("R11"); expect((await statusRoute.GET()).status).toBe(403); // standby
    await asTeam("R13"); expect((await statusRoute.GET()).status).toBe(403); // never enrolled
    await auth.logout(); expect((await statusRoute.GET()).status).toBe(401);
  });
  it("start is audited, fixes the paper version and cannot be repeated", async () => {
    await asAdmin();
    const started = await svc.startPaper(); expect(started.endsAt.getTime() - started.startsAt.getTime()).toBe(min(40));
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ contentVersion: "paper-v1" });
    expect(await db.r2Audit.count({ where: { action: "start" } })).toBe(1);
    await expect(svc.startPaper()).rejects.toMatchObject({ status: 409 });
  });
  it.each([[1, 1], [7.5, 1], [8.5, 2], [19.5, 2], [20.5, 3], [29.5, 3], [30.5, 4], [39.5, 4]] as const)("at minute %s only chapter %i is returned (no other chapter, no answer data)", async (m, ch) => {
    await ago(min(m)); await asTeam("R02");
    const s = await status(); expect(s.code).toBe(200); expect(s.body).toMatchObject({ phase: "running", chapter: { n: ch } });
    for (const n of [1, 2, 3, 4] as const) { if (n === ch) expect(s.text).toContain(MARK[n]); else expect(s.text).not.toContain(MARK[n]); }
    for (const x of SECRET) expect(s.text).not.toContain(x);
    expect(s.body.rail.map((r: { state: string }) => r.state)).toEqual([1, 2, 3, 4].map(n => n < ch ? "done" : n === ch ? "active" : "locked"));
  });
  it("at 40:00 and later everything is closed: PENS DOWN, no chapter content", async () => {
    for (const m of [40.2, 41, 120]) { await ago(min(m)); await asTeam("R02"); const s = await status(); expect(s.body).toMatchObject({ phase: "complete", chapter: null }); for (const k of Object.values(MARK)) expect(s.text).not.toContain(k); }
  });
  it("every finalist receives exactly the same data; the client cannot choose a chapter or a time", async () => {
    await ago(min(9)); await asTeam("R03"); const a = (await status()).body.chapter;
    await asTeam("R07"); const b = (await status()).body.chapter; expect(b).toEqual(a); expect(b.n).toBe(2);
    // The handler reads no query string, header or body: the only inputs are the session cookie and the server clock.
    expect(statusRoute.GET.length).toBe(0);
  });
  it("chapters never reopen as time advances", async () => {
    let last = 0;
    for (const m of [0.5, 5, 7.9, 8.1, 12, 19.9, 20.1, 25, 29.9, 30.1, 35, 39.9, 40.1, 60]) { await ago(min(m)); await asTeam("R04"); const s = (await status()).body; const n = s.phase === "complete" ? 5 : s.chapter.n; expect(n).toBeGreaterThanOrEqual(last); last = n; }
  });
  it("timing survives a server restart (fresh modules and a fresh database client read the same persisted start)", async () => {
    await ago(min(21)); await asTeam("R05"); const before = (await status()).body.chapter.n;
    vi.resetModules();
    const fresh = await import("../src/lib/round2/paper/service.server"); const again = await fresh.paperStatus();
    expect(before).toBe(3); expect(again.chapter?.n).toBe(3); expect(again.phase).toBe("running");
  });
  it("legacy online endpoints are retired: nothing can be submitted, drafted or published", async () => {
    await ago(min(9)); await asTeam("R02");
    const submit = await import("../src/app/api/round2/submit/route"), drafts = await import("../src/app/api/round2/drafts/route"), evidence = await import("../src/app/api/round2/evidence/route"), results = await import("../src/app/api/round2/results/route");
    expect((await submit.POST(req("POST", "/api/round2/submit", { taskId: "i1.assets", answer: {} }))).status).toBe(410);
    expect((await drafts.PUT(req("PUT", "/api/round2/drafts", { taskId: "x", data: {}, baseVersion: 0 }))).status).toBe(410);
    expect((await evidence.GET()).status).toBe(410); expect((await results.GET()).status).toBe(410);
    expect(await db.r2Submission.count()).toBe(0); expect(await db.r2TaskScore.count()).toBe(0); expect(await db.r2Draft.count()).toBe(0);
  });
  it("the organizer sees the schedule, current chapter and the taunt window; teams cannot read it", async () => {
    await ago(min(8) + 5_000); await asAdmin();
    const t = await svc.paperTiming(); expect(t).toMatchObject({ phase: "running", chapter: 2, chapterTitle: "Kill Switch" }); expect(t.taunt).toContain("Ten connections"); expect(t.schedule).toHaveLength(5);
    await ago(min(12)); expect((await svc.paperTiming()).taunt).toBeNull();
    await asTeam("R02"); await expect(svc.paperTiming()).rejects.toMatchObject({ status: 401 });
  });
  it("ending early needs a reason, closes every chapter immediately and cannot be repeated", async () => {
    await ago(min(12)); await asAdmin();
    await expect(svc.endPaper("no")).rejects.toMatchObject({ status: 400 });
    await svc.endPaper("Fire drill, stopping early"); await asTeam("R02"); expect((await status()).body).toMatchObject({ phase: "complete", chapter: null });
    await asAdmin(); await expect(svc.endPaper("second attempt here")).rejects.toMatchObject({ status: 409 });
    expect(await db.r2Audit.count({ where: { action: "end" } })).toBe(1);
  });
});
