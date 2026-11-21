import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";
import { attemptCap, TIER_CAP, taskTiers } from "../src/lib/attempts";
import { criterionPoints, r2Catalog } from "../src/lib/round2/catalog";
import { gradeValidated, validateAnswer } from "../src/lib/round2/tasks.server";
import { answerHash } from "../src/lib/round2/safe-json";
import { perfect } from "./fixtures/round2";
import { randomAnswer, rng } from "./helpers/random-answers";

// Round 2 scoring policy against the REAL service on a disposable PostgreSQL (opt in: GHOST_DB_TEST=1).
// scoringPolicy NULL = a session that started before policies existed (legacy union-v0); "best-v1" = the approved policy every new session gets.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
const keys = ["E-101", "E-102", "E-103", "E-107", "E-108", "E-110"];
const constant = (c: string) => ({ classifications: Object.fromEntries(keys.map(k => [k, c])) });
const score = (taskId: string, a: unknown) => { const v = validateAnswer(taskId, a); const set = v.ok ? new Set(gradeValidated(taskId, v.data)) : new Set<string>(); return { set, pts: [...set].reduce((n, c) => n + (criterionPoints.get(c) ?? 0), 0) }; };

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 2 scoring policy best-v1", { timeout: 300_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let play: typeof import("../src/lib/round2/play.server");
  let n = 0;
  const gap = () => db.r2Submission.updateMany({ data: { createdAt: new Date(0) } });
  const policy = (scoringPolicy: string | null) => db.r2Session.update({ where: { id: 1 }, data: { scoringPolicy } });
  const team = async () => { const id = `PL${++n}`; await db.team.create({ data: { id, name: id, participants: "[]", codeHash: hashPassword("x"), variant: "A", progress: JSON.stringify(initialProgress()) } }); await db.r2Finalist.create({ data: { teamId: id, status: "active", seed: n, snapshotDigest: "d" } }); return id; };
  const send = async (id: string, task: string, answer: unknown) => { await gap(); return play.submitTask(id, task, answer); };
  const stored = (id: string, task: string) => db.r2TaskScore.findUnique({ where: { teamId_taskId: { teamId: id, taskId: task } } });
  const attemptsOf = async (id: string, task: string) => (await play.r2Status(id)).tasks.find(t => t.id === task)!.attempts;

  beforeAll(async () => {
    temp = await createTempDatabase("r2policy");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url;
    ({ db } = await import("../src/lib/db")); play = await import("../src/lib/round2/play.server");
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - 19 * 60_000) } }); // minute 19: every incident released; scoringPolicy NULL (legacy) until a test sets it
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("the attempt matrix covers all 26 tasks with caps 2/3/5 (tier A=2, B=3, C=5)", () => {
    for (const t of r2Catalog) { expect(taskTiers[t.id], t.id).toBeDefined(); expect(Object.values(TIER_CAP)).toContain(attemptCap(t.id)); }
    const count = (tier: string) => r2Catalog.filter(t => taskTiers[t.id].tier === tier).length;
    expect([count("A"), count("B"), count("C"), count("X")]).toEqual([9, 12, 5, 0]);
  });

  it("LEGACY union-v0 (NULL policy): three constant guesses farm i1.classify to 6/6; i3.verdicts needs two", async () => {
    await policy(null); const id = await team();
    for (const c of ["benign", "suspicious", "compromise"]) await send(id, "i1.classify", constant(c));
    expect((await stored(id, "i1.classify"))?.earned).toBe(6);
    await send(id, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } });
    expect(await send(id, "i3.verdicts", { verdicts: { A: "false", B: "false", C: "false" } })).toMatchObject({ task: { earned: 3, max: 3 }, policy: "union-v0" });
    expect((await attemptsOf(id, "i1.classify")).cap).toBe(12);
  });

  it("best-v1: constant guesses never combine (2/6, not 6/6) and tier A allows exactly 2 distinct attempts", async () => {
    await policy("best-v1"); const id = await team();
    expect(await send(id, "i1.classify", constant("benign"))).toMatchObject({ awarded: 2, improved: true, task: { earned: 2 }, attempts: { used: 1, cap: 2, remaining: 1 }, policy: "best-v1" });
    expect(await send(id, "i1.classify", constant("suspicious"))).toMatchObject({ awarded: 0, improved: false, task: { earned: 2 }, attempts: { used: 2, cap: 2, remaining: 0 } });
    await expect(send(id, "i1.classify", constant("compromise"))).rejects.toMatchObject({ status: 429, message: "No attempts remaining. Your highest score has been saved." });
    expect((await stored(id, "i1.classify"))?.earned).toBe(2); expect(await attemptsOf(id, "i1.classify")).toEqual({ used: 2, cap: 2, remaining: 0 });
    // i3.verdicts (tier A): the old 2-attempt farm yields only 2/3
    const v = await team(); await send(v, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } });
    expect(await send(v, "i3.verdicts", { verdicts: { A: "false", B: "false", C: "false" } })).toMatchObject({ task: { earned: 2, max: 3 } });
  });
  it("best-v1: worse keeps the best (and uses an attempt), better awards only the difference, identical resend is free, tiebreak time moves only on improvement", async () => {
    await policy("best-v1"); const id = await team();
    const partial = { classifications: { ...(perfect["i1.classify"] as { classifications: object }).classifications, "E-103": "compromise", "E-108": "compromise" } }; // 4/6
    expect(await send(id, "i1.classify", partial)).toMatchObject({ awarded: 4 });
    const t0 = (await stored(id, "i1.classify"))!.lastAwardAt.getTime(), crit0 = (await stored(id, "i1.classify"))!.criteria;
    expect(await send(id, "i1.classify", constant("benign"))).toMatchObject({ awarded: 0, task: { earned: 4 }, attempts: { used: 2, remaining: 0 } });
    expect((await stored(id, "i1.classify"))!.lastAwardAt.getTime()).toBe(t0); expect((await stored(id, "i1.classify"))!.criteria).toBe(crit0);
    expect(await send(id, "i1.classify", partial)).toMatchObject({ duplicate: true, awarded: 0, attempts: { used: 2 } }); // free even at the cap
    const j = await team(); await send(j, "i1.classify", partial);
    expect(await send(j, "i1.classify", perfect["i1.classify"])).toMatchObject({ awarded: 2, task: { earned: 6 }, improved: true });
  });
  it("best-v1: tier B and tier C caps hold (3 and 5 distinct attempts)", async () => {
    await policy("best-v1"); const b = await team(), c = await team();
    const orders = [["sq-1", "sq-2", "sq-3", "sq-4", "sq-5", "sq-6"], ["sq-2", "sq-1", "sq-3", "sq-4", "sq-5", "sq-6"], ["sq-3", "sq-2", "sq-1", "sq-4", "sq-5", "sq-6"], ["sq-4", "sq-2", "sq-3", "sq-1", "sq-5", "sq-6"]];
    for (const o of orders.slice(0, 3)) await send(b, "i4.sequence", { order: o });
    await expect(send(b, "i4.sequence", { order: orders[3] })).rejects.toMatchObject({ status: 429 });
    const sets = [["E-101"], ["E-102"], ["E-103"], ["E-104"], ["E-105"], ["E-106"]].map(x => ({ evidenceIds: [...x, "E-107", "E-108"] }));
    for (const s of sets.slice(0, 5)) await send(c, "i1.justify", s);
    await expect(send(c, "i1.justify", sets[5])).rejects.toMatchObject({ status: 429 });
    expect((await attemptsOf(c, "i1.justify")).cap).toBe(5);
  });
  it("EVERY task: under best-v1 the stored score and criteria are exactly those of the best coherent random submission, the cap is enforced, and invalid/duplicate answers cost nothing", async () => {
    await policy("best-v1");
    for (const task of r2Catalog) {
      await db.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - (task.part === "A" ? 19 : 26) * 60_000) } }); // Part A tasks are open at minute 19, Part B tasks at minute 26
      const id = await team(), cap = attemptCap(task.id), r = rng(7000 + n), tried: { pts: number; set: Set<string>; hash: string }[] = [];
      let guard = 0;
      while (tried.length < cap + 2 && guard++ < 200) {
        const a = randomAnswer(task.id, r), v = validateAnswer(task.id, a); if (!v.ok) continue; const h = answerHash(v.data); if (tried.some(t => t.hash === h)) continue;
        tried.push({ ...score(task.id, a), hash: h });
        const idx = tried.length - 1;
        if (idx < cap) { const before = (await stored(id, task.id))?.earned ?? 0; if (before >= Object.values(task.criteria).reduce((x, y) => x + y, 0)) { tried.pop(); break; } await send(id, task.id, a); }
        else { await expect(send(id, task.id, a), task.id).rejects.toMatchObject({ status: 429 }); }
      }
      const graded = tried.slice(0, cap), bestPts = Math.max(0, ...graded.map(t => t.pts)), firstBest = graded.find(t => t.pts === bestPts);
      const row = await stored(id, task.id);
      expect(row?.earned ?? 0, `${task.id} earned`).toBe(bestPts);
      if (bestPts > 0) expect(new Set(JSON.parse(row!.criteria)), `${task.id} criteria are one submission's`).toEqual(firstBest!.set);
      expect((await attemptsOf(id, task.id)).used, `${task.id} used`).toBeLessThanOrEqual(cap);
    }
    await db.r2Session.update({ where: { id: 1 }, data: { startsAt: new Date(Date.now() - 19 * 60_000) } });
  });
  it("status API exposes authoritative attempts for all 26 tasks and the policy; no criterion ids leak", async () => {
    await policy("best-v1"); const id = await team(); await send(id, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } });
    const st = await play.r2Status(id);
    expect(st.policy).toBe("best-v1"); expect(st.tasks).toHaveLength(26);
    for (const t of st.tasks) expect(t.attempts).toEqual({ used: t.id === "i3.verdicts" ? 1 : 0, cap: attemptCap(t.id), remaining: attemptCap(t.id) - (t.id === "i3.verdicts" ? 1 : 0) });
    expect(JSON.stringify(st)).not.toMatch(/criteri|i3\.verdicts:/);
  });
  it("concurrent distinct submissions at the attempt boundary never exceed the cap", async () => {
    await policy("best-v1"); const id = await team(); await gap();
    const answers = [["A", "B"], ["A"], ["B"], ["C"], ["A", "C"], ["B", "C"]].map(f => ({ verdicts: { A: f.includes("A") ? "true" : "false", B: f.includes("B") ? "true" : "false", C: f.includes("C") ? "true" : "false" } }));
    const results = await Promise.allSettled(answers.map(a => play.submitTask(id, "i3.verdicts", a)));
    expect(results.filter(r => r.status === "fulfilled").length).toBe(1); // the shared 3 s gap + per-team lock admit exactly one
    expect((await attemptsOf(id, "i3.verdicts")).used).toBe(1);
    const row = await db.r2Submission.count({ where: { teamId: id } }); expect(row).toBe(1);
  });
  it("the policy is stored per session: an environment variable or a restart cannot change it, and audit rows name it", async () => {
    process.env.GHOST_R2_SCORING_POLICY = "union";
    await policy("best-v1"); const id = await team(); await send(id, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } });
    vi.resetModules(); const fresh = await import("../src/lib/round2/play.server");
    expect((await fresh.r2Status(id)).policy).toBe("best-v1");
    expect((await db.r2Submission.findFirstOrThrow({ where: { teamId: id } })).scoringPolicy).toBe("best-v1");
    await policy(null); vi.resetModules(); const legacy = await import("../src/lib/round2/play.server");
    expect((await legacy.r2Status(id)).policy).toBe("union-v0"); // a NULL (pre-policy) session is legacy, never silently upgraded
    delete process.env.GHOST_R2_SCORING_POLICY; await policy("best-v1");
  });
  it("switching a session from legacy to best never lowers what was earned (historic compatibility)", async () => {
    await policy(null); const id = await team();
    for (const c of ["benign", "suspicious"]) await send(id, "i1.classify", constant(c)); // union: 4
    await policy("best-v1");
    await expect(send(id, "i1.classify", constant("compromise"))).rejects.toMatchObject({ status: 429 }); // tier A cap (2) already used under the legacy rule
    expect((await stored(id, "i1.classify"))?.earned).toBe(4); // nothing earned is ever taken away
  });
});
