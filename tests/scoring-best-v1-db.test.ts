import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { initialProgress, type Progress } from "../src/lib/game/engine";
import { attemptCap, taskTiers } from "../src/lib/attempts";
import { catalog, criterionPoints, gradeTask } from "../src/lib/game/scoring";
import { taskDefs } from "../src/lib/game/validators";
import { answerHash } from "../src/lib/round2/safe-json";
import { hashPassword } from "../src/lib/password.mjs";
import { inboxAnswers } from "./fixtures/inbox";
import { containmentAnswers } from "./fixtures/containment";
import { taskAnswer } from "./fixtures/tasks";
import { containmentEvidence } from "../src/lib/game/containment.server";

// Approved best-v1 scoring for ROUND 1 against a disposable PostgreSQL (opt in: GHOST_DB_TEST=1). The legacy union-v0 behaviour is reproduced first,
// in a round whose scoringPolicy is NULL (a round that started before policies existed), then best-v1 is shown to close the exploit.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
const origin = "http://127.0.0.1:3000"; // (APP_ORIGIN only; route-level forged-field rejection is covered by scoring-db.test.ts)

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 1 scoring policy best-v1", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let service: typeof import("../src/lib/game/service");
  let n = 0;
  type Patch = { chapters?: Partial<Progress["chapters"][number]>[] };
  const mk = async (patch: Patch = {}) => { const id = `B${++n}`, p = initialProgress(); (patch.chapters ?? []).forEach((c, i) => Object.assign(p.chapters[i], c)); await db.team.create({ data: { id, name: id, participants: "[]", codeHash: hashPassword("x"), variant: "A", progress: JSON.stringify(p) } }); return id; };
  const age = (id: string) => db.submission.updateMany({ where: { teamId: id }, data: { createdAt: new Date(0) } });
  const task = async (id: string, chapter: number, taskId: string, answer: unknown) => { await age(id); return service.mutateTeam(id, chapter, "submit", answer, taskId) as Promise<Record<string, unknown>>; };
  const chapterSubmit = async (id: string, chapter: number, answer: unknown) => { await age(id); return service.mutateTeam(id, chapter, "submit", answer) as Promise<Record<string, unknown>>; };
  const setPolicy = (scoringPolicy: string | null) => db.gameSession.update({ where: { id: 1 }, data: { scoringPolicy } });
  const row = (id: string, taskId: string) => db.taskScore.findUnique({ where: { teamId_taskId: { teamId: id, taskId } } });
  const wrong = (taskId: string, extra: Record<string, unknown> = {}) => ({ ...Object.fromEntries(Object.keys(taskAnswer(taskId, "A")).map(k => [k, "x-wrong"])), ...extra });
  const unlockedContainment: Patch = { chapters: [{ score: 15, completedAt: 1 }, { score: 25, completedAt: 2 }, { score: 13 }] };

  beforeAll(async () => {
    temp = await createTempDatabase("r1best");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.APP_ORIGIN = origin;
    ({ db } = await import("../src/lib/db")); service = await import("../src/lib/game/service");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) } }); // scoringPolicy NULL = legacy union-v0
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("the approved attempt matrix covers every Round 1 task, with tiers 2/3/5", () => {
    for (const t of catalog.flat()) { expect(taskTiers[t.id], t.id).toBeDefined(); expect([2, 3, 5, 8]).toContain(attemptCap(t.id)); }
  });

  it("LEGACY union-v0 (round started before policies): containment.immediate is farmed one option at a time to 4/4", async () => {
    await setPolicy(null); const id = await mk(unlockedContainment), options = containmentEvidence("A").immediateOptions.map(o => o.id);
    for (const o of options) await task(id, 3, "containment.immediate", { immediateActions: [o] });
    expect((await row(id, "containment.immediate"))?.earned).toBe(4);
    expect((await service.teamState(id)).tasks[3][2].attempts).toBeNull(); // legacy rounds show no attempt counters
  });

  it("EVERY Round 1 task: stored score = best single submission, cap enforced, no later or format-switched attempt adds up", async () => {
    await setPolicy("best-v1");
    const deepWrong = (v: unknown): unknown => typeof v === "string" ? "x-wrong" : Array.isArray(v) ? v.map(deepWrong) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepWrong(x)])) : v;
    for (const [chapter, list] of catalog.entries()) for (const t of list) {
      const id = await mk({ chapters: [0, 1, 2, 3, 4].map(i => (i === 0 ? {} : { unlockedAt: 1 })) });
      await db.insiderAccess.upsert({ where: { teamId: id }, create: { teamId: id, fragmentA: `A-${id}`, fragmentB: `B-${id}`, unlockedAt: new Date() }, update: {} });
      const good = taskAnswer(t.id, "A") as Record<string, unknown>, keys = Object.keys(good), cap = attemptCap(t.id);
      const partial = keys.length > 1 ? keys.map(k => ({ ...(deepWrong(good) as object), [k]: good[k] })) : [];
      const variants = [deepWrong(good), ...partial, good].filter((v, i, all) => all.findIndex(w => answerHash(w) === answerHash(v)) === i);
      const pts = (a: unknown) => gradeTask(taskDefs[chapter], t.id, a, "A").reduce((n, c) => n + (criterionPoints.get(c) ?? 0), 0);
      const graded: number[] = [];
      for (const v of variants) {
        const res = await task(id, chapter, t.id, v);
        if (graded.length < cap) { expect(res.error, `${t.id} attempt ${graded.length + 1}`).toBeUndefined(); graded.push(pts(v)); }
        else expect(res, `${t.id} beyond the cap`).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." });
        if ((await row(id, t.id))!.earned >= Object.values(t.criteria).reduce((a, b) => a + b, 0)) break; // task complete: nothing further to submit
      }
      const stored = await row(id, t.id);
      expect(stored!.earned, `${t.id} earned`).toBe(Math.max(...graded));
      expect(stored!.attempts, `${t.id} attempts`).toBeLessThanOrEqual(cap);
      expect(stored!.attempts, `${t.id} attempts`).toBe(graded.length);
    }
  });
  it("best-v1: the same sweep is capped at 3 distinct attempts and one correct option is worth at most 1 point", async () => {
    await setPolicy("best-v1"); const id = await mk(unlockedContainment), options = containmentEvidence("A").immediateOptions.map(o => o.id);
    const correct = containmentAnswers.A.immediateActions, ordered = [...correct as readonly string[], ...options.filter(o => !(correct as readonly string[]).includes(o))];
    for (const o of ordered.slice(0, 3)) await task(id, 3, "containment.immediate", { immediateActions: [o] });
    const r = await task(id, 3, "containment.immediate", { immediateActions: [ordered[3]] });
    expect(r).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." });
    const stored = await row(id, "containment.immediate"); expect(stored?.earned).toBe(1); expect(stored?.attempts).toBe(3);
    expect((await service.teamState(id)).tasks[3][2].attempts).toEqual({ used: 3, cap: 3, remaining: 0 });
  });

  it("best-v1: incompatible partial answers never combine; a worse answer keeps the best; improvement awards only the difference", async () => {
    await setPolicy("best-v1"); const id = await mk();
    const only = (...keys: string[]) => ({ ...wrong("inbox.entry"), ...Object.fromEntries(keys.map(k => [k, taskAnswer("inbox.entry", "A")[k]])) });
    expect(await task(id, 0, "inbox.entry", only("emailId"))).toMatchObject({ awarded: 2, taskEarned: 2, improved: true });
    expect(await task(id, 0, "inbox.entry", only("deliveryId"))).toMatchObject({ awarded: 0, taskEarned: 2, improved: false }); // different guess, equal value: nothing added
    expect(await task(id, 0, "inbox.entry", only("snapshotId"))).toMatchObject({ awarded: 0, taskEarned: 2 }); // union-v0 would now be 6/6
    expect((await row(id, "inbox.entry"))?.earned).toBe(2);
    expect(await task(id, 0, "inbox.entry", wrong("inbox.entry"))).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." }); // cap 3 reached
  });
  it("best-v1: a worse answer retains the best; the best coherent answer can still be improved within the cap", async () => {
    await setPolicy("best-v1"); const id = await mk();
    const good = taskAnswer("inbox.entry", "A"), two = { ...good, snapshotId: "x-wrong" }; // 4/6
    expect(await task(id, 0, "inbox.entry", two)).toMatchObject({ awarded: 4, taskEarned: 4 });
    expect(await task(id, 0, "inbox.entry", wrong("inbox.entry"))).toMatchObject({ awarded: 0, taskEarned: 4 }); // worse: retained, still consumes an attempt
    expect((await row(id, "inbox.entry"))?.criteria).toBe(JSON.stringify(["inbox.entry:emailId", "inbox.entry:deliveryId"]));
    expect(await task(id, 0, "inbox.entry", good)).toMatchObject({ awarded: 2, taskEarned: 6, improved: true });
    expect((await row(id, "inbox.entry"))?.attempts).toBe(3);
  });
  it("best-v1: an identical re-submission is idempotent and does not consume an attempt", async () => {
    await setPolicy("best-v1"); const id = await mk(), a = { ...taskAnswer("inbox.impact", "A"), databaseId: "x-wrong" };
    expect(await task(id, 0, "inbox.impact", a)).toMatchObject({ awarded: 0 });
    expect(await task(id, 0, "inbox.impact", a)).toMatchObject({ duplicate: true, awarded: 0 });
    expect(await task(id, 0, "inbox.impact", a)).toMatchObject({ duplicate: true });
    expect((await row(id, "inbox.impact"))?.attempts).toBe(1);
  });
  it("best-v1: switching request formats cannot buy extra attempts (chapter submissions share the per-task counters)", async () => {
    await setPolicy("best-v1"); const id = await mk(), bad = (i: number) => ({ ...inboxAnswers.A, emailId: `x-wrong-${i}`, deliveryId: `x-wrong-${i}`, snapshotId: `x-wrong-${i}`, authenticationId: `x-wrong-${i}`, sessionId: `x-wrong-${i}`, databaseId: `x-wrong-${i}` });
    await chapterSubmit(id, 0, bad(1)); await chapterSubmit(id, 0, bad(2)); // inbox.impact (cap 2) is now exhausted; entry/identity have 1 left
    expect((await service.teamState(id)).tasks[0].map(t => t.attempts?.remaining)).toEqual([1, 1, 0]);
    expect(await task(id, 0, "inbox.impact", wrong("inbox.impact", { databaseId: "x-other" }))).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." });
    expect(await chapterSubmit(id, 0, bad(3))).toMatchObject({ tasks: expect.any(Array) }); // consumes entry and identity only
    expect((await service.teamState(id)).tasks[0].map(t => t.attempts?.remaining)).toEqual([0, 0, 0]);
    expect(await chapterSubmit(id, 0, inboxAnswers.A)).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." }); // even a perfect chapter answer is refused
    expect(await task(id, 0, "inbox.entry", taskAnswer("inbox.entry", "A"))).toMatchObject({ error: "No attempts remaining. Your highest score has been saved." });
    expect((await service.teamState(id)).score).toBe(0);
  });
  it("best-v1: a perfect chapter submission within the caps still earns everything and completes the chapter", async () => {
    await setPolicy("best-v1"); const id = await mk();
    expect(await chapterSubmit(id, 0, inboxAnswers.A)).toMatchObject({ accepted: true, awarded: 15, chapterRaw: 15 });
    const s = await service.teamState(id); expect(s.progress.chapters[0].completedAt).not.toBeNull(); expect(s.unlocked[1]).toBe(true);
  });
  it("best-v1: the 50% unlock, revisiting an earlier chapter and preserved scores all still work", async () => {
    await setPolicy("best-v1"); const id = await mk();
    const entry = taskAnswer("inbox.entry", "A"), ident = taskAnswer("inbox.identity", "A");
    await task(id, 0, "inbox.entry", entry); await task(id, 0, "inbox.identity", { ...ident, sessionId: "x-wrong" }); // 6 + 3 = 9 >= 8
    expect((await service.teamState(id)).unlocked[1]).toBe(true);
    await task(id, 1, "trail.source", taskAnswer("trail.source", "A")); // work in the unlocked chapter
    await task(id, 0, "inbox.identity", ident); // go back to Inbox and improve
    const s = await service.teamState(id); expect(s.progress.chapters[0].score).toBe(12); expect(s.progress.chapters[1].score).toBe(8); expect(s.unlocked[1]).toBe(true);
  });
  it("best-v1: attempts are written to the audit rows (policy version, task, answer hash) and survive a restart", async () => {
    await setPolicy("best-v1"); const id = await mk(); await task(id, 0, "inbox.impact", taskAnswer("inbox.impact", "A"));
    const sub = await db.submission.findFirstOrThrow({ where: { teamId: id } }); expect(sub).toMatchObject({ scoringVersion: 3, taskId: "inbox.impact" }); expect(sub.answerHash).toMatch(/^[0-9a-f]{64}$/);
    vi.resetModules(); const fresh = await import("../src/lib/game/service");
    expect((await fresh.teamState(id)).policy).toBe("best-v1"); expect((await fresh.teamState(id)).tasks[0][2].attempts).toEqual({ used: 1, cap: 2, remaining: 1 });
  });
  it("the policy is fixed at round start from the stored row: the environment cannot change it and a second start is refused", async () => {
    process.env.GHOST_R2_SCORING_POLICY = "union"; process.env.GHOST_TX_MODE = "serializable";
    await db.gameSession.update({ where: { id: 1 }, data: { startsAt: null, deadline: null, endedAt: null, scoringPolicy: null } });
    await db.auditLog.deleteMany({ where: { action: "start" } });
    expect((await service.teamState(await mk())).policy).toBe("best-v1"); // a round that has not started will run best-v1
    await service.control("start");
    expect((await db.gameSession.findUniqueOrThrow({ where: { id: 1 } })).scoringPolicy).toBe("best-v1");
    expect(JSON.parse((await db.auditLog.findFirstOrThrow({ where: { action: "start" } })).detail).scoringPolicy).toBe("best-v1");
    await expect(service.control("start")).rejects.toThrow(); // cannot restart, so the policy cannot be re-issued
    delete process.env.GHOST_R2_SCORING_POLICY; delete process.env.GHOST_TX_MODE;
    expect((await db.gameSession.findUniqueOrThrow({ where: { id: 1 } })).scoringPolicy).toBe("best-v1");
  });
  it("concurrent submissions at the attempt boundary can never exceed the cap (per-team lock + shared 3 s gap)", async () => {
    await setPolicy("best-v1"); const id = await mk();
    await db.taskScore.create({ data: { teamId: id, chapter: 0, taskId: "inbox.impact", earned: 0, max: 3, criteria: "[]", attempts: 1 } }); // one of two attempts already used
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => service.mutateTeam(id, 0, "submit", { databaseId: `x-wrong-${i}` }, "inbox.impact")));
    expect(results.every(r => r.status === "fulfilled")).toBe(true);
    expect((await row(id, "inbox.impact"))?.attempts).toBe(2); // exactly one more graded attempt, never 9
    expect(await db.submission.count({ where: { teamId: id, scoringVersion: 3 } })).toBe(1);
  });
  it("a legacy-started round keeps union scoring after the policy migration (never silently upgraded)", async () => {
    await setPolicy(null); await db.gameSession.update({ where: { id: 1 }, data: { startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000), endedAt: null } });
    const id = await mk(); const only = (k: string) => ({ ...wrong("inbox.entry"), [k]: taskAnswer("inbox.entry", "A")[k] });
    await task(id, 0, "inbox.entry", only("emailId")); await task(id, 0, "inbox.entry", only("deliveryId")); await task(id, 0, "inbox.entry", only("snapshotId"));
    expect((await row(id, "inbox.entry"))?.earned).toBe(6); // union-v0 semantics, exactly as before
    expect((await service.teamState(id)).policy).toBe("union-v0");
  });
});
