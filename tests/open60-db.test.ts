import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolve } from "node:path";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Round 2 (GHOST RETURNS, the only format) + Kill Switch terminal. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
// Uses a SYNTHETIC test key (tests/fixtures/round2-key-fixture.json): its "attacker" IPs are deliberately NOT the case answer.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));
const T1 = "192.0.2.81", T2 = "203.0.113.88", W1 = "192.0.2.25", W2 = "198.51.100.12", W3 = "203.0.113.9", W4 = "192.0.2.92"; // fixture targets / fixture-legitimate
const NEVER = ["TEST FIXTURE", "\"malicious\"", "\"cleared\"", "wrongMessages", "verdict", "rationale", "flaws"];
const min = (m: number) => m * 60_000;

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 2 (60 minutes) and the Kill Switch terminal (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/round2/paper/service.server"), term: typeof import("../src/lib/round2/paper/terminal.server");
  let statusRoute: typeof import("../src/app/api/round2/status/route"), termRoute: typeof import("../src/app/api/round2/terminal/route"), adminRoute: typeof import("../src/app/api/round2/admin/route");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`${origin}${path}`, { method, headers: { origin, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const ago = (ms: number, format: string | null = "open-60") => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms), format }, update: { startsAt: new Date(Date.now() - ms), endedAt: null, format } });
  const run = async (command: string) => { const r = await termRoute.POST(req("POST", "/api/round2/terminal", { command })); return { code: r.status, body: await r.json() }; };
  const texts = (b: { lines?: { text: string }[] }) => (b.lines ?? []).map(l => l.text).join("\n");

  beforeAll(async () => {
    temp = await createTempDatabase("r2open");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json");
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); svc = await import("../src/lib/round2/paper/service.server"); term = await import("../src/lib/round2/paper/terminal.server");
    statusRoute = await import("../src/app/api/round2/status/route"); termRoute = await import("../src/app/api/round2/terminal/route"); adminRoute = await import("../src/app/api/round2/admin/route");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } });
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "d-1", top10: ids.slice(0, 10), standby: ids.slice(10, 12), reason: "test" }) } });
    await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: "d-1" })) });
  });
  beforeEach(() => term?.resetRateLimit());
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("a database holding a retired 40-minute session keeps it as history: participants see Round 2 closed and it cannot be restarted", async () => {
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - min(9)), contentVersion: "paper-v1" } }); // historical row, format NULL
    await asTeam("T01"); expect(await (await statusRoute.GET()).json()).toMatchObject({ phase: "complete", retired: true, injects: null });
    expect((await run(`block ${W1}`)).body.state).toMatchObject({ locked: true }); expect(await db.r2BlockAttempt.count()).toBe(0);
    await asAdmin(); await expect(svc.startPaper()).rejects.toMatchObject({ status: 409 }); expect(await svc.paperTiming()).toMatchObject({ retired: true, phase: "complete" });
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ contentVersion: "paper-v1", format: null }); // untouched
    await db.r2Session.delete({ where: { id: 1 } }); // this disposable test database only
  });
  it("the organizer starts Round 2 directly (no format to choose); teams cannot start it or pick a format", async () => {
    await asTeam("T01"); expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start" }))).status).toBe(401);
    await asAdmin();
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start", format: "paper-40" }))).status).toBe(400); // the retired format cannot be requested
    expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "start", format: "open-60" }))).status).toBe(400); // there is no format field at all
    const started = await svc.startPaper(); expect(started.endsAt.getTime() - started.startsAt.getTime()).toBe(min(60));
    expect(await db.r2Session.findUnique({ where: { id: 1 } })).toMatchObject({ format: "open-60", contentVersion: "case-v2" });
    await expect(svc.startPaper()).rejects.toMatchObject({ status: 409 });
  });
  it("all four injects are readable for the whole 60 minutes with no key material; nothing before the start or after pens down", async () => {
    for (const m of [0.5, 12, 40, 59.9]) {
      await ago(min(m)); await asTeam("T02");
      const body = await (await statusRoute.GET()).json(), text = JSON.stringify(body);
      expect(body).toMatchObject({ phase: "running" }); expect(body.injects.map((i: { n: number }) => i.n)).toEqual([1, 2, 3, 4]);
      for (const s of ["ALR-0214", "backup-agent2.exe", "IT-4518", "R-12", "Turn those machines off"]) expect(text).toContain(s);
      for (const s of NEVER) expect(text).not.toContain(s);
    }
    for (const m of [60, 61, 200]) { await ago(min(m)); await asTeam("T02"); expect(await (await statusRoute.GET()).json()).toMatchObject({ phase: "complete", injects: null }); }
  });
  it("free commands use no attempt: unknown, missing, invalid, too many arguments, not on the list", async () => {
    await ago(min(15)); await asTeam("T03");
    for (const [cmd, msg] of [["BLOK 192.0.2.25", "Unknown command. Usage: BLOCK <ip address>"], ["BLOCK", "Missing IP address. Usage: BLOCK <ip address>"], ["BLOCK abc", "Invalid IP address format."], ["BLOCK 203.0.113.999", "Invalid IP address format."], ["BLOCK 192.0.2.25 192.0.2.81", "Too many arguments. Usage: BLOCK <ip address>"], ["BLOCK 8.8.8.8", "Not a connection on this list."], ["ls; rm -rf /", "Unknown command. Usage: BLOCK <ip address>"]] as const) {
      term.resetRateLimit(); const r = await run(cmd); expect(r.code).toBe(200); expect(texts(r.body)).toBe(msg); expect(r.body.state.remaining).toBe(4); expect(r.body.used).toBe(false);
    }
    expect(await db.r2BlockAttempt.count({ where: { teamId: "T03" } })).toBe(0);
  });
  it("wrong block: one attempt, the connection's own disruption line; duplicate: 'Already blocked.' with no attempt; correct block counts threats", async () => {
    await asTeam("T04");
    const w = await run(`block ${W1}`); expect(w.body).toMatchObject({ used: true, state: { remaining: 3, contained: 0 } }); expect(texts(w.body)).toBe(`[BLOCKED] ${W1}. TEST: fixture outage one.`);
    const dup = await run(`BLOCK ${W1}`); expect(texts(dup.body)).toBe("Already blocked."); expect(dup.body.state.remaining).toBe(3); expect(dup.body.used).toBe(false);
    const ok = await run(`BLOCK ${T1}`); expect(texts(ok.body)).toBe(`[OK] ${T1} BLOCKED. Suspicious traffic stopped. 1 of 2 threats contained.`); expect(ok.body.state).toMatchObject({ remaining: 2, contained: 1, locked: false });
    expect(JSON.stringify(ok.body)).not.toContain(T2); // an unattempted target is never revealed
    const dup2 = await run(`block ${T1}`); expect(texts(dup2.body)).toBe("Already blocked."); expect(dup2.body.state.remaining).toBe(2);
  });
  it("both threats contained locks the terminal at once (early success); later commands say 'Terminal locked.'", async () => {
    await asTeam("T05");
    await run(`block ${T1}`); const both = await run(`block ${T2}`);
    expect(texts(both.body)).toBe(`[OK] ${T2} BLOCKED. Suspicious traffic stopped. 2 of 2 threats contained.\n[OK] Both threats contained. Terminal locked.`);
    expect(both.body.state).toMatchObject({ locked: true, lockReason: "contained", remaining: 2, contained: 2 });
    const after = await run(`block ${W1}`); expect(texts(after.body)).toBe("Terminal locked."); expect(await db.r2BlockAttempt.count({ where: { teamId: "T05" } })).toBe(2);
  });
  it("four attempts exhaust the terminal: FAIL line and the volunteer warning; a fifth command changes nothing", async () => {
    await asTeam("T06");
    for (const ip of [W1, W2, W3]) expect((await run(`block ${ip}`)).body.used).toBe(true);
    const last = await run(`block ${W4}`);
    expect(texts(last.body)).toContain("[FAIL] Out of attempts. Terminal locked. See a volunteer."); expect(texts(last.body)).toContain("CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!");
    expect(last.body.state).toMatchObject({ remaining: 0, locked: true, lockReason: "exhausted" });
    expect(texts((await run(`block ${T1}`)).body)).toBe("Terminal locked."); expect(await db.r2BlockAttempt.count({ where: { teamId: "T06" } })).toBe(4);
  });
  it("concurrent requests from many tabs cannot exceed four attempts; refresh and re-login keep the history and its messages", async () => {
    await asTeam("T07");
    const ips = ["192.0.2.25", "198.51.100.12", "203.0.113.9", "198.51.100.77", "203.0.113.45", "198.51.100.140", "203.0.113.30", "192.0.2.92"];
    const results = await Promise.all(ips.map(ip => termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${ip}` }))));
    const bodies = await Promise.all(results.map(r => r.json()));
    expect(bodies.filter(b => b.used === true).length).toBeLessThanOrEqual(4); expect(await db.r2BlockAttempt.count({ where: { teamId: "T07" } })).toBeLessThanOrEqual(4);
    await asTeam("T07"); const st = await (await termRoute.GET()).json(); expect(st.attempts.length).toBeLessThanOrEqual(4); expect(st.attempts[0].message).toMatch(/^\[BLOCKED\]/);
  });
  it("teams are isolated; standby, outsiders, anonymous users and forged requests are refused", async () => {
    await asTeam("T08"); expect((await (await termRoute.GET()).json()).attempts).toEqual([]);
    await asTeam("T11"); expect((await termRoute.GET()).status).toBe(403); expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${W1}` }))).status).toBe(403);
    await auth.logout(); expect((await termRoute.GET()).status).toBe(401);
    await asTeam("T08");
    expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${W1}` }, { origin: "http://evil.example" }))).status).toBe(403);
    expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${W1}`, teamId: "T04" }))).status).toBe(400);
    expect((await termRoute.POST(req("POST", "/api/round2/terminal", { command: `block ${W1}`, result: "caught" }))).status).toBe(400);
    expect(await db.r2BlockAttempt.count({ where: { teamId: "T08" } })).toBe(0);
  });
  it("rate limit: a burst beyond 6 commands in 10 s is refused with no attempt used", async () => {
    await asTeam("T09");
    const codes: number[] = []; for (let i = 0; i < 9; i++) codes.push((await termRoute.POST(req("POST", "/api/round2/terminal", { command: "help me" }))).status);
    expect(codes.filter(c => c === 429).length).toBe(3); expect(await db.r2BlockAttempt.count({ where: { teamId: "T09" } })).toBe(0);
  });
  it("organizer review shows attempts and the portal score; teams cannot read it", async () => {
    await asTeam("T04"); expect((await adminRoute.GET(req("GET", "/api/round2/admin?view=terminal"))).status).toBe(401);
    await asAdmin(); const r = await term.terminalReview();
    const row = (id: string) => r.teams.find(t => t.teamId === id)!;
    expect(row("T04")).toMatchObject({ score: 3, contained: 1 }); // one legitimate + one attacker: 5 - 2
    expect(row("T05")).toMatchObject({ score: 15, lockReason: "contained" }); expect(row("T06")).toMatchObject({ score: 0, lockReason: "exhausted" });
    expect(row("T08")).toMatchObject({ untouched: true, score: 5 }); expect(JSON.stringify(r)).not.toContain("wrongMessages");
  });
  it("pens down and early end lock the terminal; a new session starts a fresh budget", async () => {
    await ago(min(60) + 1000); await asTeam("T10");
    expect(texts((await run(`block ${W1}`)).body)).toMatch(/not running/); expect((await (await termRoute.GET()).json())).toMatchObject({ locked: true, lockReason: "closed" });
    await ago(min(5)); await asAdmin(); await svc.endPaper("Fire drill, stopping early"); await asTeam("T10"); expect(texts((await run(`block ${W1}`)).body)).toMatch(/not running/);
    await db.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - min(1)), endedAt: null } }); await asTeam("T06");
    expect((await (await termRoute.GET()).json()).remaining).toBe(4); // T06's earlier attempts belong to the previous session start
  });
  it("without an approved key the terminal stays offline and uses no attempt", async () => {
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/does-not-exist.json"); (await import("../src/lib/round2/paper/private-key.server")).resetCaseKeyCache();
    await ago(min(3)); await asTeam("T02");
    const r = await run(`block ${W1}`); expect(texts(r.body)).toMatch(/awaiting/i); expect(r.body.used).toBe(false);
    expect(await (await termRoute.GET()).json()).toMatchObject({ lockReason: "no-key", locked: true, remaining: 4 });
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json"); (await import("../src/lib/round2/paper/private-key.server")).resetCaseKeyCache();
  });
  it("demo classification is organizer-only and stores nothing", async () => {
    await asTeam("T09"); expect((await adminRoute.POST(req("POST", "/api/round2/admin", { action: "demo-block", ip: W1, previous: [] }))).status).toBe(401);
    await asAdmin(); const before = await db.r2BlockAttempt.count();
    const r = await (await adminRoute.POST(req("POST", "/api/round2/admin", { action: "demo-block", ip: T1, previous: [] }))).json(); expect(r.result).toBe("caught");
    expect(await db.r2BlockAttempt.count()).toBe(before);
  });
});
