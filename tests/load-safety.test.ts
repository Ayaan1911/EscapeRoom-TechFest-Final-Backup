import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { Scope, assertEmpty, assertRemoteTarget, cleanup, redact, writeRound } from "../scripts/load-safety.mjs";
import { digest } from "../src/lib/password.mjs";

const PW = "s3cretPassw0rd";
const good = {
  origin: "https://ghost404-loadtest.onrender.com",
  databaseUrl: `postgresql://user:${PW}@ep-x-pooler.ap-southeast-1.aws.neon.tech/ghost404_loadtest?sslmode=require`,
  adminCode: "organizer-code-1234", argv: ["--yes-remote", "--authorize-round-control"],
  env: { GHOST_LOAD_ENV: "disposable-loadtest", GHOST_LOAD_TARGET_DB: "ghost404_loadtest" } as Record<string, string>,
};
const refuse = (patch: Partial<typeof good>) => () => assertRemoteTarget({ ...good, ...patch });

describe("remote target gate (fail closed)", () => {
  it("accepts only a fully and explicitly identified disposable target", () => expect(assertRemoteTarget(good)).toEqual({ database: "ghost404_loadtest", host: "ghost404-loadtest.onrender.com" }));
  it.each([
    ["http origin", { origin: "http://ghost404-loadtest.onrender.com" }],
    ["local origin", { origin: "https://localhost" }],
    ["ip origin", { origin: "https://10.0.0.5" }],
    ["preview service origin", { origin: "https://ghost404-round1-preview.onrender.com" }],
    ["missing --yes-remote", { argv: ["--authorize-round-control"] }],
    ["missing round authorization", { argv: ["--yes-remote"] }],
    ["no environment label", { env: { GHOST_LOAD_TARGET_DB: "ghost404_loadtest" } }],
    ["wrong environment label", { env: { GHOST_LOAD_ENV: "preview", GHOST_LOAD_TARGET_DB: "ghost404_loadtest" } }],
    ["preview database", { databaseUrl: good.databaseUrl.replace("ghost404_loadtest", "ghost404_preview"), env: { ...good.env, GHOST_LOAD_TARGET_DB: "ghost404_preview" } }],
    ["database without the test marker", { databaseUrl: good.databaseUrl.replace("ghost404_loadtest", "neondb"), env: { ...good.env, GHOST_LOAD_TARGET_DB: "neondb" } }],
    ["marker plus event word", { databaseUrl: good.databaseUrl.replace("ghost404_loadtest", "event_loadtest"), env: { ...good.env, GHOST_LOAD_TARGET_DB: "event_loadtest" } }],
    ["target not confirmed", { env: { GHOST_LOAD_ENV: "disposable-loadtest" } }],
    ["target confirmation for another db", { env: { GHOST_LOAD_ENV: "disposable-loadtest", GHOST_LOAD_TARGET_DB: "other_loadtest" } }],
    ["malformed database url", { databaseUrl: "not a url" }],
    ["non-postgres url", { databaseUrl: "mysql://u:p@h/ghost404_loadtest" }],
    ["missing admin code", { adminCode: "" }],
    ["missing database url", { databaseUrl: "" }],
  ])("refuses: %s", (_name, patch) => expect(refuse(patch as Partial<typeof good>)).toThrow());
  it("never leaks the password, URL or admin code in a refusal", () => {
    for (const patch of [{ argv: [] }, { env: {} }, { databaseUrl: good.databaseUrl.replace("ghost404_loadtest", "ghost404_preview") }]) {
      try { assertRemoteTarget({ ...good, ...patch }); } catch (e) { const m = String((e as Error).message); expect(m).not.toContain(PW); expect(m).not.toMatch(/postgres(ql)?:\/\//); expect(m).not.toContain(good.adminCode); }
    }
  });
});

describe("redaction", () => {
  it("strips connection strings, known secrets and key=value credentials", () => {
    const text = `connect failed postgresql://u:${PW}@host/db?x=1 and ${good.adminCode} password=hunter22222 token: abcdef123456`;
    const out = redact(text, [good.adminCode, PW]);
    for (const leak of [PW, "host/db", good.adminCode, "hunter22222", "abcdef123456"]) expect(out).not.toContain(leak);
  });
});

describe("harness source has no broad destructive statements", () => {
  const src = [readFileSync("scripts/load-test.mjs", "utf8"), readFileSync("scripts/load-safety.mjs", "utf8")].join("\n");
  it("no unfiltered deleteMany/updateMany/delete and no GameSession deleteMany", () => {
    expect(src).not.toMatch(/deleteMany\(\s*\)/);
    expect(src).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/);
    expect(src).not.toMatch(/updateMany\(\s*\{\s*data/);
    expect(src).not.toMatch(/\$executeRaw|TRUNCATE|DROP\s+(DATABASE|TABLE|SCHEMA)/i);
    expect(src).not.toMatch(/gameSession\.deleteMany\(\s*\)/);
  });
  it("every deleteMany/updateMany in the cleanup is filtered by a scope", () => {
    const calls = readFileSync("scripts/load-safety.mjs", "utf8").match(/(?:deleteMany|updateMany)\(\{[^)]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(5);
    for (const c of calls) expect(c).toMatch(/where/);
  });
  it("test code never deletes by a time window", () => expect(src).not.toMatch(/createdAt:\s*\{\s*(gt|gte|lt|lte)/));
});

describe("cleanup with a recording fake (no database)", () => {
  type Call = { model: string; op: string; args: { where?: Record<string, unknown> } };
  const fake = (failOn?: string) => {
    const calls: Call[] = [];
    const model = (name: string) => new Proxy({}, { get: (_t, op: string) => async (args: Call["args"]) => { calls.push({ model: name, op, args }); if (failOn === name) throw new Error("postgresql://u:" + PW + "@h/db exploded"); return { count: 0 }; } });
    return { calls, db: { submission: model("submission"), auditLog: model("auditLog"), loginAttempt: model("loginAttempt"), teamSession: model("teamSession"), team: model("team"), gameSession: model("gameSession") } };
  };
  const scope = () => { const s = new Scope(); ["GH-01", "GH-02", "GHZ-ID-AB"].forEach(id => s.addTeam(id)); s.adminTokens.add("raw-admin-cookie"); s.round = { original: null, last: { startsAt: new Date(1000), deadline: new Date(2000) } }; return s; };

  it("every statement carries a non-empty, exact scope", async () => {
    const f = fake(); expect((await cleanup(f.db, scope())).ok).toBe(true);
    expect(f.calls.length).toBeGreaterThan(5);
    for (const c of f.calls) { expect(c.args?.where, `${c.model}.${c.op}`).toBeTruthy(); expect(Object.keys(c.args.where!).length).toBeGreaterThan(0); }
    const byModel = (m: string) => f.calls.find(c => c.model === m)!.args.where as Record<string, { in?: unknown[] }>;
    expect(byModel("team").id.in).toEqual(["GH-01", "GH-02", "GHZ-ID-AB"]);
    expect(byModel("submission").teamId.in).toHaveLength(3);
    expect(byModel("auditLog").actor.in).toHaveLength(3);
    expect(byModel("teamSession")).toEqual({ tokenHash: { in: [digest("raw-admin-cookie")] }, role: "admin" });
    expect(byModel("gameSession")).toMatchObject({ id: 1, startsAt: new Date(1000), deadline: new Date(2000) });
  });
  it("with nothing tracked it deletes nothing", async () => {
    const f = fake(); expect(await cleanup(f.db, new Scope())).toEqual({ ok: true, failed: [] }); expect(f.calls).toHaveLength(0);
  });
  it("a failing step is reported, other scoped steps still run, and nothing broader is attempted", async () => {
    const f = fake("submission"); const r = await cleanup(f.db, scope());
    expect(r.ok).toBe(false); expect(r.failed).toEqual(["submissions"]);
    expect(f.calls.some(c => c.model === "team")).toBe(true);
    for (const c of f.calls) expect(c.args?.where).toBeTruthy();
  });
  it("cleanup does not throw or leak the failure text", async () => {
    const f = fake("team"); const r = await cleanup(f.db, scope()); expect(JSON.stringify(r)).not.toContain(PW);
  });
});

describe.skipIf(!process.env.GHOST_DB_TEST)("against real PostgreSQL", { timeout: 60_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>; let db: PrismaClient;
  const team = (id: string) => db.team.create({ data: { id, name: id, participants: "[]", codeHash: "x", variant: "A", progress: "{}" } });
  beforeAll(async () => { temp = await createTempDatabase("safety"); db = new PrismaClient({ datasourceUrl: temp.url }); });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("accepts an empty database", async () => { await expect(assertEmpty(db)).resolves.toBeUndefined(); });
  const seeds: Record<string, (d: PrismaClient) => Promise<unknown>> = {
    "a team": d => d.team.create({ data: { id: "R", name: "R", participants: "[]", codeHash: "x", variant: "A", progress: "{}" } }),
    "a submission": d => d.submission.create({ data: { teamId: "R", chapter: 0, accepted: false, reason: "x" } }),
    "an audit row": d => d.auditLog.create({ data: { actor: "organizer", action: "start", detail: "{}" } }),
    "an organizer session": d => d.teamSession.create({ data: { tokenHash: "h", role: "admin", expiresAt: new Date(Date.now() + 1e6) } }),
    "a login attempt": d => d.loginAttempt.create({ data: { key: "k", failures: 1, windowStart: new Date() } }),
    "a started round": d => d.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 1e6) } }),
  };
  it.each(Object.keys(seeds))("refuses a non-empty database: %s", async name => {
    const t = await createTempDatabase("safety2"), d = new PrismaClient({ datasourceUrl: t.url });
    try { await seeds[name](d); await expect(assertEmpty(d)).rejects.toThrow(/not empty/); } finally { await d.$disconnect(); await t.drop(); }
  });

  it("cleanup removes only this run's rows and leaves unrelated and concurrently created data untouched", async () => {
    const mine = new Scope();
    for (const id of ["GH-01", "GH-02"]) { mine.addTeam(id); await team(id); await db.submission.create({ data: { teamId: id, chapter: 0, accepted: true, reason: "completed" } }); await db.auditLog.create({ data: { actor: id, action: "hint", detail: "{}" } }); await db.loginAttempt.create({ data: { key: digest(`team:${id}`), failures: 1, windowStart: new Date() } }); }
    mine.adminTokens.add("my-admin-cookie"); await db.teamSession.create({ data: { tokenHash: digest("my-admin-cookie"), role: "admin", expiresAt: new Date(Date.now() + 1e6) } });
    await writeRound(db, mine, { startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) });
    // unrelated rows created while the run was going (an organizer, a real-looking team, an audit entry with a near timestamp)
    await team("OTHER-1"); await db.submission.create({ data: { teamId: "OTHER-1", chapter: 0, accepted: true, reason: "completed" } });
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: "{}" } });
    await db.auditLog.create({ data: { actor: "OTHER-1", action: "hint", detail: "{}" } });
    await db.teamSession.create({ data: { tokenHash: digest("other-admin"), role: "admin", expiresAt: new Date(Date.now() + 1e6) } });
    await db.teamSession.create({ data: { tokenHash: digest("other-team"), role: "team", teamId: "OTHER-1", expiresAt: new Date(Date.now() + 1e6) } });
    await db.loginAttempt.create({ data: { key: digest("admin:organizer"), failures: 3, windowStart: new Date() } }); // same key the harness uses: part of its exact scope by design
    await db.loginAttempt.create({ data: { key: digest("team:OTHER-1"), failures: 2, windowStart: new Date() } });

    expect(await cleanup(db, mine)).toEqual({ ok: true, failed: [] });
    expect((await db.team.findMany()).map(t => t.id)).toEqual(["OTHER-1"]);
    expect(await db.submission.count()).toBe(1);
    expect((await db.auditLog.findMany()).map(a => a.actor).sort()).toEqual(["OTHER-1", "organizer"]);
    expect((await db.teamSession.findMany()).map(s => s.tokenHash).sort()).toEqual([digest("other-admin"), digest("other-team")].sort());
    expect((await db.loginAttempt.findMany()).map(l => l.key)).toEqual([digest("team:OTHER-1")]);
    expect(await db.gameSession.count()).toBe(0); // the round row this run created is removed (compare-and-delete)
  });

  it("does not touch a round row someone else changed after the run wrote it", async () => {
    const s = new Scope(); await writeRound(db, s, { startsAt: new Date(5000), deadline: new Date(9000) });
    await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(123456) } }); // organizer changed it
    await cleanup(db, s);
    expect((await db.gameSession.findUniqueOrThrow({ where: { id: 1 } })).deadline!.getTime()).toBe(123456);
    await db.gameSession.deleteMany({ where: { id: 1 } });
  });

  it("restores a pre-existing, unstarted round row instead of deleting it", async () => {
    await db.gameSession.create({ data: { id: 1 } });
    const s = new Scope(); await writeRound(db, s, { startsAt: new Date(), deadline: new Date(Date.now() + 1e6) });
    await cleanup(db, s);
    const r = await db.gameSession.findUniqueOrThrow({ where: { id: 1 } }); expect([r.startsAt, r.deadline]).toEqual([null, null]);
    await db.gameSession.deleteMany({ where: { id: 1 } });
  });
});
