import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolve } from "node:path";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Round 2 jury marking, publication and the projector broadcast. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
// Uses the SYNTHETIC test key (tests/fixtures): its IPs are deliberately not the case answer.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));
const min = (m: number) => m * 60_000;

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 2 marking, publication and broadcast (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), adminRoute: typeof import("../src/app/api/round2/admin/route"), projRoute: typeof import("../src/app/api/admin/projector/route");
  let bc: typeof import("../src/lib/game/broadcast.server");
  const code = "temporary-test-access-only", origin = "http://127.0.0.1:3000";
  const ids = Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`), active = ids.slice(0, 10);
  const req = (method: string, path: string, body?: unknown) => new NextRequest(`${origin}${path}`, { method, headers: { origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const post = async (body: unknown) => { const r = await adminRoute.POST(req("POST", "/api/round2/admin", body)); return { code: r.status, body: await r.json() }; };
  const board = async () => (await (await adminRoute.GET(req("GET", "/api/round2/admin?view=marking"))).json()) as { phase: string; rows: { teamId: string; total: number | null; pending: string[]; rank: number | null; terminal: { score: number | null } }[]; complete: number; canPublish: boolean; publishedAt: string | null };
  const projector = async () => { const r = await projRoute.GET(); return { code: r.status, body: await r.json() }; };
  const startAgo = (ms: number) => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - ms), format: "open-60" }, update: { startsAt: new Date(Date.now() - ms), endedAt: null, format: "open-60" } });

  beforeAll(async () => {
    temp = await createTempDatabase("r2mark");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    process.env.GHOST_R2_KEY_FILE = resolve("tests/fixtures/round2-key-fixture.json");
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); adminRoute = await import("../src/app/api/round2/admin/route"); projRoute = await import("../src/app/api/admin/projector/route"); bc = await import("../src/lib/game/broadcast.server");
    for (const id of ids) await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 7_200_000), deadline: new Date(Date.now() - 3_600_000) } });
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "d-1", top10: active, standby: ids.slice(10), reason: "test" }) } });
    await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: "d-1" })) });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("participants and anonymous users cannot read the board, mark, publish or read the projector", async () => {
    await auth.logout();
    expect((await adminRoute.GET(req("GET", "/api/round2/admin?view=marking"))).status).toBe(401);
    expect((await projector()).code).toBe(401);
    await asTeam("M01");
    expect((await adminRoute.GET(req("GET", "/api/round2/admin?view=marking"))).status).toBe(401);
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 15, marker: "Self" })).code).toBe(401);
    expect((await post({ action: "publish", reason: "self publish" })).code).toBe(401);
    expect((await projector()).code).toBe(401);
  });

  it("nothing can be marked before Round 2 starts", async () => {
    await asAdmin();
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 10, marker: "Jury A" })).code).toBe(409);
    expect((await board()).rows.every(r => r.total === null)).toBe(true);
  });

  it("validates marks: Inject 2 cannot be typed, 0-15 whole numbers only, a marker is required, finalists only", async () => {
    await asAdmin(); await startAgo(min(20));
    expect((await post({ action: "mark", teamId: "M01", inject: 2, score: 15, marker: "Jury A" })).code).toBe(400);
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 16, marker: "Jury A" })).code).toBe(400);
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 2.5, marker: "Jury A" })).code).toBe(400);
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 5, marker: "J" })).code).toBe(400);
    expect((await post({ action: "mark", teamId: "M11", inject: 1, score: 5, marker: "Jury A" })).code).toBe(404); // standby, not active
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 5, marker: "Jury A", terminal: 15 })).code).toBe(400); // no extra fields
  });

  it("saves, edits and clears with an audit trail; totals stay pending while the round runs", async () => {
    await asAdmin();
    for (const inject of [1, 3, 4]) expect((await post({ action: "mark", teamId: "M01", inject, score: 10, marker: "Jury A" })).code).toBe(200);
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 12, marker: "Jury B" })).code).toBe(200);
    const row = (await board()).rows.find(r => r.teamId === "M01")!;
    expect(row.total).toBeNull(); expect(row.pending).toEqual(["Kill Switch (round running)"]);
    expect((await post({ action: "mark", teamId: "M01", inject: 4, score: null, marker: "Jury B" })).code).toBe(200);
    expect((await board()).rows.find(r => r.teamId === "M01")!.pending).toContain("Inject 4");
    const trail = await db.r2Audit.findMany({ where: { action: "paper-mark" }, orderBy: { createdAt: "asc" } });
    expect(trail.map(t => JSON.parse(t.detail))).toContainEqual({ teamId: "M01", inject: 1, from: 10, to: 12, marker: "Jury B" });
    expect(trail.map(t => JSON.parse(t.detail))).toContainEqual({ teamId: "M01", inject: 4, from: 10, to: null, marker: "Jury B" });
  });

  it("publishing needs pens down and complete marking; totals add the terminal score once", async () => {
    await asAdmin();
    expect((await post({ action: "publish", reason: "too early" })).code).toBe(409); // still running
    await startAgo(min(61)); // pens down
    expect((await post({ action: "publish", reason: "incomplete" })).code).toBe(409);
    for (const teamId of active) for (const inject of [1, 3, 4]) expect((await post({ action: "mark", teamId, inject, score: inject === 1 ? 10 : 5, marker: "Jury A" })).code).toBe(200);
    const b = await board();
    expect(b.canPublish).toBe(true); expect(b.complete).toBe(10);
    for (const r of b.rows) expect(r.total).toBe(20 + r.terminal.score!); // 10 + 5 + 5 + terminal, once
    expect((await projector()).body.results).toBeNull(); // not public before publication
    expect((await projector()).body.scene).toBe("pens-down");
    expect((await post({ action: "publish", reason: "x" })).code).toBe(400); // reason required
    expect((await post({ action: "publish", reason: "Head judge approved all sheets" })).code).toBe(200);
    expect((await post({ action: "publish", reason: "Head judge approved all sheets" })).code).toBe(409); // once
    expect((await post({ action: "mark", teamId: "M01", inject: 1, score: 15, marker: "Jury A" })).code).toBe(409); // locked
    expect(await db.r2Audit.count({ where: { action: "publish-results" } })).toBe(1);
  });

  it("the projector shows only published, minimal fields and switched-on standings", async () => {
    await asAdmin();
    await new Promise(r => setTimeout(r, 3_100)); // broadcast cache TTL
    const p = (await projector()).body;
    expect(p.scene).toBe("results");
    expect(Object.keys(p.results[0]).sort()).toEqual(["name", "rank", "tied", "total"]);
    expect(p.standings).toBeNull(); expect(p.finalists).toBeNull(); // both default OFF
    const text = JSON.stringify(p);
    for (const leak of ["codeHash", "participants", "marker", "192.0.2", "203.0.113", "198.51.100", "teamId"]) expect(text).not.toContain(leak);
    await bc.setBroadcast("standings", true, "show standings test");
    const q = (await projector()).body;
    expect(q.standings.length).toBe(12); expect(Object.keys(q.standings[0]).sort()).toEqual(["chaptersDone", "id", "name", "rank", "score", "tied"]);
    expect(await db.auditLog.count({ where: { action: "broadcast-standings-on" } })).toBe(1);
  });
});
