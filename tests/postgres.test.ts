import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { initialProgress, score } from "../src/lib/game/engine";
import { hashPassword } from "../src/lib/password.mjs";
import { inboxAnswers } from "./fixtures/inbox";
import { NextRequest } from "next/server";

// PostgreSQL-specific proofs: transactional correctness under real concurrency, restart/recovery.
// Needs the local disposable server (npm run db:test:up). Runs with the other DB tests: GHOST_DB_TEST=1 npm test.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

describe.skipIf(!process.env.GHOST_DB_TEST)("PostgreSQL concurrency and recovery", { timeout: 90_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let auth: typeof import("../src/lib/auth");
  let service: typeof import("../src/lib/game/service");
  const code = "temporary-test-access-only";
  const team = (id: string, variant = "A") => db.team.create({ data: { id, name: id, participants: JSON.stringify(["One", "Two", "Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(initialProgress()) } });
  beforeAll(async () => {
    temp = await createTempDatabase("pgtest");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url;
    process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); service = await import("../src/lib/game/service");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) } });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("awards a chapter exactly once when 20 identical correct submissions race", async () => {
    await team("RACE-1");
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.mutateTeam("RACE-1", 0, "submit", inboxAnswers.A)));
    const accepted = results.filter(r => r.status === "fulfilled" && (r.value as { accepted?: boolean }).accepted);
    expect(accepted).toHaveLength(1);
    const row = await db.team.findUniqueOrThrow({ where: { id: "RACE-1" } });
    expect(score(JSON.parse(row.progress))).toBe(15);
    expect(await db.submission.count({ where: { teamId: "RACE-1", accepted: true } })).toBe(1);
  });

  it("scores 50 teams submitting in parallel correctly and independently", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `PAR-${String(i + 1).padStart(2, "0")}`);
    for (const id of ids) await team(id);
    const results = await Promise.all(ids.map(id => service.mutateTeam(id, 0, "submit", inboxAnswers.A)));
    expect(results.every(r => (r as { accepted?: boolean }).accepted)).toBe(true);
    const rows = await db.team.findMany({ where: { id: { startsWith: "PAR-" } } });
    expect(rows).toHaveLength(50);
    for (const row of rows) expect(score(JSON.parse(row.progress))).toBe(15);
    expect(await db.submission.count({ where: { teamId: { startsWith: "PAR-" }, accepted: true } })).toBe(50);
  });

  it("releases hints once per step under a race and never below the cap", async () => {
    await team("HINT-1");
    await Promise.allSettled(Array.from({ length: 10 }, () => service.mutateTeam("HINT-1", 0, "hint", undefined)));
    const hints = JSON.parse((await db.team.findUniqueOrThrow({ where: { id: "HINT-1" } })).progress).chapters[0].hints;
    expect(hints).toBeGreaterThanOrEqual(1); expect(hints).toBeLessThanOrEqual(2);
  });

  it("handles a 150-login burst across 50 teams without errors and keeps the failed-login budget intact", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `PAR-${String(i + 1).padStart(2, "0")}`);
    const logins = await Promise.all(ids.flatMap(id => [1, 2, 3].map(() => auth.login("team", id, code))));
    expect(logins.every(Boolean)).toBe(true);
    // sessions for PAR-01 exist, and wrong codes still exhaust the throttle on a fresh ID
    for (let i = 0; i < 10; i++) expect(await auth.login("team", "RACE-1", "wrong-code-" + i)).toBe(false);
    expect(await auth.login("team", "RACE-1", code)).toBe(false);
  });

  it("applies simultaneous organizer actions once (start is idempotent, audit rows are all recorded)", async () => {
    await db.gameSession.update({ where: { id: 1 }, data: { startsAt: null, deadline: null, endedAt: null } });
    jar.clear(); await auth.login("admin", "organizer", code);
    await Promise.allSettled([service.control("start"), service.control("start"), service.control("start")]);
    const round = await db.gameSession.findUniqueOrThrow({ where: { id: 1 } });
    expect(round.startsAt).not.toBeNull(); expect(round.deadline!.getTime() - round.startsAt!.getTime()).toBe(3_600_000);
    expect(await db.auditLog.count({ where: { action: "start" } })).toBeGreaterThanOrEqual(1);
    jar.clear();
  });

  it("health: liveness never touches the database; readiness (?db=1) does and exposes no data", async () => {
    const health = await import("../src/app/api/health/route");
    const live = await health.GET(new NextRequest("http://127.0.0.1:3000/api/health")); expect(await live.json()).toEqual({ ok: true });
    const ready = await health.GET(new NextRequest("http://127.0.0.1:3000/api/health?db=1")); const body = await ready.json();
    expect(body).toEqual({ ok: true, database: "up", round: "active" }); expect(JSON.stringify(body)).not.toMatch(/team|hash|code/i);
  });

  it("keeps scores, sessions and the deadline across a full client restart", async () => {
    const before = await db.team.findMany({ orderBy: { id: "asc" } });
    const deadline = (await db.gameSession.findUniqueOrThrow({ where: { id: 1 } })).deadline!.getTime();
    await db.$disconnect(); // connection loss / process restart: the next query reconnects to the same database
    const after = await db.team.findMany({ orderBy: { id: "asc" } });
    expect(after.map(t => [t.id, t.progress])).toEqual(before.map(t => [t.id, t.progress]));
    expect((await db.gameSession.findUniqueOrThrow({ where: { id: 1 } })).deadline!.getTime()).toBe(deadline);
    expect(await db.teamSession.count()).toBeGreaterThan(0);
  });
});
