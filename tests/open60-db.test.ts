import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolve } from "node:path";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// open-60 format (case document v2) + Inject 2 terminal. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
// Uses a TEST key fixture whose targets differ from the real (private) case key.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));
const FIXTURE_TARGETS = ["192.0.2.81", "192.0.2.92"], CLEARED = "192.0.2.25";
const SECRET = ["TEST FIXTURE", "\"malicious\"", "\"cleared\"", "verdict", "rationale", "\"planted\"", "flaws", "NOT ENOUGH EVIDENCE\",\"reason"];
const min = (m: number) => m * 60_000;

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("open-60 format and Inject 2 terminal (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/round2/paper/service.server"), term: typeof import("../src/lib/round2/paper/terminal.server");
  let statusRoute: typeof import("../src/app/api/round2/status/route"), termRoute: typeof import("../src/app/api/round2/terminal/route"), adminRoute: typeof import("../src/app/api/round2/admin/route");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`${origin}${path}`, { method, headers: { origin, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const ago = (ms: number, format = "open-60") => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms), format }, update: { startsAt: new Date(Date.now() - ms), endedAt: null, format } });
  const run = async (command: string) => { const r = await termRoute.POST(req("POST", "/api/round2/terminal", { command })); return { code: r.status, body: await r.json() }; };

  beforeAll(async () => {
    temp = await createTempDatabase("open60");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json");
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); svc = await import("../src/lib/round2/paper/service.server"); term = await import("../src/lib/round2/paper/terminal.server");
    statusRoute = await import("../src/app/api/round2/status/route"); termRoute = await import("../src/app/api/round2/terminal/route"); adminRoute = await import("../src/app/api/round2/admin/route");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } });
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "d-1", top10: ids.slice(0, 10), standby: ids.slice(10, 12), reason: "test" }) } });
    await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: "d-1" })) });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("the organizer picks the format at start; it is snapshotted, audited and cannot be switched while running; teams cannot start or choose", async () => {
    await asTeam("T01");
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start", format: "open-60" }))).status).toBe(401);
    await asAdmin();
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start", format: "ninety-minutes" }))).status).toBe(400);
    const started = await svc.startPaper("open-60");
    expect(started.endsAt.getTime() - started.startsAt.getTime()).toBe(min(60));
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ format: "open-60", contentVersion: "case-v2" });
    expect(JSON.parse((await db.r2Audit.findFirstOrThrow({ where: { action: "start" } })).detail)).toMatchObject({ format: "open-60" });
    await expect(svc.startPaper("paper-40")).rejects.toMatchObject({ status: 409 }); // no switching once started
    expect((await db.r2Session.findUnique({ where: { id: 1 } }))?.format).toBe("open-60");
  });
  it("all four injects are readable for the whole 60 minutes, with no answer data; nothing before the start or after pens down", async () => {
    for (const m of [0.5, 9, 30, 55, 59.9]) {
      await ago(min(m)); await asTeam("T02");
      const r = await statusRoute.GET(), body = await r.json(), text = JSON.stringify(body);
      expect(body).toMatchObject({ format: "open-60", phase: "running" }); expect(body.injects.map((i: { n: number }) => i.n)).toEqual([1, 2, 3, 4]);
      for (const s of ["ALR-0214", "wsvc_sync.exe", "SENTINEL", "R-12", "Turn those machines off"]) if (s !== "SENTINEL") expect(text).toContain(s);
      for (const s of SECRET) expect(text).not.toContain(s);
    }
    for (const m of [60, 61, 200]) { await ago(min(m)); await asTeam("T02"); const body = await (await statusRoute.GET()).json(); expect(body).toMatchObject({ phase: "complete", injects: null }); }
    await db.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() + min(5)) } }); await asTeam("T02");
    expect(await (await statusRoute.GET()).json()).toMatchObject({ phase: "not_started", injects: null });
  });
  it("the existing 40-minute format is unchanged when selected (one chapter at a time, original content)", async () => {
    await ago(min(9), "paper-40"); await asTeam("T02");
    const body = await (await statusRoute.GET()).json(); expect(body.format).toBeUndefined(); expect(body).toMatchObject({ phase: "running", chapter: { n: 2 } }); expect(body.injects).toBeUndefined();
    await asTeam("T03"); const t = await run(`block ${FIXTURE_TARGETS[0]}`); expect(t.code).toBe(409); // no terminal in the 40-minute format
  });
  it("syntax errors and addresses not on the monitor use no attempt; real targets say CAUGHT; cleared ones use an attempt", async () => {
    await ago(min(15)); await asTeam("T04");
    for (const bad of ["help", "block", "block 300.1.1.1", "block 1.2.3.4; rm -rf /", "ls -la"]) { const r = await run(bad); expect(r.code).toBe(200); expect(r.body.message).toBeTruthy(); expect(r.body.state.remaining).toBe(4); }
    const typo = await run("block 10.9.8.7"); expect(typo.body.message).toMatch(/No live connection/); expect(typo.body.state.remaining).toBe(4);
    const a = await run(`BLOCK ${FIXTURE_TARGETS[0]}`); expect(a.body).toMatchObject({ result: "caught", state: { remaining: 3, locked: false, allCaught: false } });
    const b = await run(`block ${CLEARED}`); expect(b.body).toMatchObject({ result: "cleared", state: { remaining: 2 } });
    const c = await run(`block ${FIXTURE_TARGETS[0]}`); expect(c.body).toMatchObject({ result: "repeat", state: { remaining: 1 } });
    const text = JSON.stringify(c.body); expect(text).not.toContain(FIXTURE_TARGETS[1]); // an unattempted target is never revealed
    const d = await run(`block ${FIXTURE_TARGETS[1]}`); expect(d.body).toMatchObject({ result: "caught", state: { remaining: 0, locked: true, allCaught: true } });
    const e = await run(`block ${CLEARED}`); expect(e.code).toBe(409); // fifth attempt refused
    expect(await db.r2BlockAttempt.count({ where: { teamId: "T04" } })).toBe(4);
  });
  it("four attempts in total, even with concurrent tabs; refresh and re-login keep the history", async () => {
    await asTeam("T05");
    const results = await Promise.all(Array.from({ length: 9 }, () => termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${CLEARED}` }))));
    expect(results.filter(r => r.status === 200)).toHaveLength(4);
    expect(await db.r2BlockAttempt.count({ where: { teamId: "T05" } })).toBe(4);
    await asTeam("T05"); const after = await (await termRoute.GET()).json();
    expect(after).toMatchObject({ remaining: 0, locked: true, allCaught: false }); expect(after.attempts.map((x: { seq: number }) => x.seq)).toEqual([1, 2, 3, 4]);
    expect(after.attempts.map((x: { result: string }) => x.result)).toEqual(["cleared", "repeat", "repeat", "repeat"]);
  });
  it("teams are isolated; standby, outsiders and anonymous users are refused", async () => {
    await asTeam("T06"); expect((await (await termRoute.GET()).json()).attempts).toEqual([]);
    await asTeam("T11"); expect((await termRoute.GET()).status).toBe(403); expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${CLEARED}` }))).status).toBe(403);
    await auth.logout(); expect((await termRoute.GET()).status).toBe(401);
    await asTeam("T06"); expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${CLEARED}` }, { origin: "http://evil.example" }))).status).toBe(403);
    expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${CLEARED}`, teamId: "T04" }))).status).toBe(400); // no team override
  });
  it("the terminal locks at pens down and after an early end; a new session starts a fresh budget", async () => {
    await ago(min(60) + 1000); await asTeam("T07");
    expect((await run(`block ${CLEARED}`)).code).toBe(409); expect((await (await termRoute.GET()).json()).locked).toBe(true);
    await ago(min(5)); await asAdmin(); await svc.endPaper("Fire drill, stopping early"); await asTeam("T07"); expect((await run(`block ${CLEARED}`)).code).toBe(409);
    await db.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(1)), endedAt: null } }); await asTeam("T04");
    expect((await (await termRoute.GET()).json()).remaining).toBe(4); // T04's earlier attempts belong to the previous session start
  });
  it("without an approved answer set the terminal stays disabled and uses no attempt", async () => {
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/does-not-exist.json"); (await import("../src/lib/round2/paper/private-key.server")).resetCaseKeyCache();
    await ago(min(3)); await asTeam("T08");
    const r = await run(`block ${CLEARED}`); expect(r.code).toBe(409); expect(r.body.error).toMatch(/awaiting/i);
    expect((await (await termRoute.GET()).json())).toMatchObject({ keyReady: false, locked: true, remaining: 4 });
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json"); (await import("../src/lib/round2/paper/private-key.server")).resetCaseKeyCache();
  });
  it("demo classification is organizer-only and stores nothing", async () => {
    await asTeam("T09"); expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "demo-block", ip: CLEARED, previous: [] }))).status).toBe(401);
    await asAdmin(); const before = await db.r2BlockAttempt.count();
    const r = await (await adminRoute.POST(req("POST", "/api/round2/admin", { action: "demo-block", ip: FIXTURE_TARGETS[0], previous: [] }))).json(); expect(r).toEqual({ result: "caught" });
    expect(await db.r2BlockAttempt.count()).toBe(before);
    expect(term.MAX_BLOCKS).toBe(4);
  });
});
