import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";
import { perfect } from "./fixtures/round2";

// F3 through the REAL service on a disposable PostgreSQL: the union policy is farmable, the dormant "best" policy is not. Opt in with GHOST_DB_TEST=1.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
const keys = ["E-101", "E-102", "E-103", "E-107", "E-108", "E-110"];
const constant = (c: string) => ({ classifications: Object.fromEntries(keys.map(k => [k, c])) });

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Round 2 scoring policy (F3)", { timeout: 120_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let play: typeof import("../src/lib/round2/play.server");
  let n = 0;
  const gap = () => db.r2Submission.updateMany({ data: { createdAt: new Date(0) } });
  const team = async () => { const id = `PL${++n}`; await db.team.create({ data: { id, name: id, participants: "[]", codeHash: hashPassword("x"), variant: "A", progress: JSON.stringify(initialProgress()) } }); await db.r2Finalist.create({ data: { teamId: id, status: "active", seed: n, snapshotDigest: "d" } }); return id; };
  const send = async (id: string, task: string, answer: unknown) => { await gap(); return play.submitTask(id, task, answer); };
  const earned = async (id: string, task: string) => (await db.r2TaskScore.findUnique({ where: { teamId_taskId: { teamId: id, taskId: task } } }))?.earned ?? 0;

  beforeAll(async () => {
    temp = await createTempDatabase("r2policy");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url;
    ({ db } = await import("../src/lib/db")); play = await import("../src/lib/round2/play.server");
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - 19 * 60_000) } }); // minute 19: all incidents released
  });
  afterAll(async () => { delete process.env.GHOST_R2_SCORING_POLICY; await db?.$disconnect(); await temp?.drop(); });

  it("UNION (release default): three constant guesses farm i1.classify to 6/6 without reading any evidence", async () => {
    delete process.env.GHOST_R2_SCORING_POLICY; const id = await team();
    expect(await send(id, "i1.classify", constant("benign"))).toMatchObject({ awarded: 2 });
    expect(await send(id, "i1.classify", constant("suspicious"))).toMatchObject({ awarded: 2 });
    expect(await send(id, "i1.classify", constant("compromise"))).toMatchObject({ awarded: 2, task: { earned: 6 } });
    expect(await earned(id, "i1.classify")).toBe(6);
  });
  it("UNION: i3.verdicts is farmed with 2 submissions", async () => {
    const id = await team();
    await send(id, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } });
    expect(await send(id, "i3.verdicts", { verdicts: { A: "false", B: "false", C: "false" } })).toMatchObject({ task: { earned: 3, max: 3 } });
  });

  it("BEST (dormant policy): the same guesses never accumulate; only the best coherent submission counts", async () => {
    process.env.GHOST_R2_SCORING_POLICY = "best"; const id = await team();
    expect(await send(id, "i1.classify", constant("benign"))).toMatchObject({ awarded: 2, task: { earned: 2 } });
    expect(await send(id, "i1.classify", constant("suspicious"))).toMatchObject({ awarded: 0, task: { earned: 2 } }); // equal-scoring different guess adds nothing
    expect(await send(id, "i1.classify", constant("compromise"))).toMatchObject({ awarded: 0, task: { earned: 2 } });
    expect(await earned(id, "i1.classify")).toBe(2);
  });
  it("BEST: a genuinely better coherent answer still earns the remainder; a worse one never lowers the score; identical resend stays free", async () => {
    process.env.GHOST_R2_SCORING_POLICY = "best"; const id = await team();
    const partial = { classifications: { ...(perfect["i1.classify"] as { classifications: object }).classifications, "E-103": "compromise", "E-108": "compromise" } }; // 4/6
    expect(await send(id, "i1.classify", partial)).toMatchObject({ awarded: 4, task: { earned: 4 } });
    const before = (await db.r2TaskScore.findUniqueOrThrow({ where: { teamId_taskId: { teamId: id, taskId: "i1.classify" } } })).lastAwardAt.getTime();
    expect(await send(id, "i1.classify", constant("benign"))).toMatchObject({ awarded: 0, task: { earned: 4 } }); // worse (2): ignored
    expect((await db.r2TaskScore.findUniqueOrThrow({ where: { teamId_taskId: { teamId: id, taskId: "i1.classify" } } })).lastAwardAt.getTime()).toBe(before); // tiebreak time only moves on improvement
    expect(await send(id, "i1.classify", perfect["i1.classify"])).toMatchObject({ awarded: 2, task: { earned: 6 } });
    expect(await send(id, "i1.classify", perfect["i1.classify"])).toMatchObject({ duplicate: true, awarded: 0 });
  });
  it("BEST: closed-choice tasks get a small attempt cap (3), identical resends still free", async () => {
    process.env.GHOST_R2_SCORING_POLICY = "best"; const id = await team();
    for (const v of [{ A: "true", B: "true", C: "true" }, { A: "true", B: "false", C: "true" }, { A: "false", B: "true", C: "true" }]) await send(id, "i3.verdicts", { verdicts: v });
    await expect(send(id, "i3.verdicts", { verdicts: { A: "false", B: "false", C: "true" } })).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Attempt limit") });
    expect(await send(id, "i3.verdicts", { verdicts: { A: "true", B: "true", C: "true" } })).toMatchObject({ duplicate: true });
  });
  it("switching UNION → BEST mid-round keeps everything already earned (historic compatibility)", async () => {
    delete process.env.GHOST_R2_SCORING_POLICY; const id = await team();
    await send(id, "i1.classify", constant("benign")); await send(id, "i1.classify", constant("suspicious")); // union: 4
    process.env.GHOST_R2_SCORING_POLICY = "best";
    expect(await send(id, "i1.classify", constant("compromise"))).toMatchObject({ awarded: 0, task: { earned: 4 } });
    expect(await earned(id, "i1.classify")).toBe(4);
    delete process.env.GHOST_R2_SCORING_POLICY;
  });
});
