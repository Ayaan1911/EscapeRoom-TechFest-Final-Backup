import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { initialProgress, points, type Progress } from "../src/lib/game/engine";
import { MAX_SCORED_ATTEMPTS } from "../src/lib/game/scoring";
import { hashPassword } from "../src/lib/password.mjs";
import { inboxAnswers, tamperAnswer } from "./fixtures/inbox";
import { trailAnswers } from "./fixtures/trail";
import { insiderAnswers } from "./fixtures/insider";
import { containmentAnswers } from "./fixtures/containment";
import { verdictAnswers } from "./fixtures/verdict";

// Disposable local PostgreSQL only (scripts/pg-temp.mjs refuses non-local hosts). Opt in with GHOST_DB_TEST=1.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

const wrongInbox = { ...inboxAnswers.A, emailId: "x-wrong", deliveryId: "x-wrong", snapshotId: "x-wrong", authenticationId: "x-wrong", databaseId: "x-wrong", sessionId: "x-wrong" };
// Inbox A criterion values: entry 2+2+2, identity 3+3, impact 3.
const inbox = (keys: (keyof typeof inboxAnswers.A)[]) => ({ ...wrongInbox, ...Object.fromEntries(keys.map(key => [key, inboxAnswers.A[key]])) });
const wrongTrail = { ...trailAnswers.A, account: "x@nexus.example", sourceIp: "192.0.2.250", sessionId: "x-wrong", eventId: "EV-x", supportingEvidenceIds: ["x-1", "x-2", "x-3"] };

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("task scoring, unlocking and drafts (PostgreSQL)", { timeout: 120_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db;
  let auth: typeof import("../src/lib/auth");
  let service: typeof import("../src/lib/game/service");
  let drafts: typeof import("../src/lib/game/drafts.server");
  const code = "temporary-test-access-only";
  const origin = "http://127.0.0.1:3000";
  let n = 0;
  type Patch = { chapters?: Partial<Progress["chapters"][number]>[]; bonus?: 0 | 5; completedAt?: number | null };
  const progressOf = (patch: Patch = {}): Progress => { const p = initialProgress(); (patch.chapters ?? []).forEach((c, i) => Object.assign(p.chapters[i], c)); return { ...p, bonus: patch.bonus ?? 0, completedAt: patch.completedAt ?? null }; };
  const mk = async (patch: Patch = {}, variant = "A") => { const id = `S${++n}`; await db.team.create({ data: { id, name: id, participants: JSON.stringify(["One", "Two", "Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(progressOf(patch)) } }); return id; };
  // The 3 s evidence cooldown is real behaviour; tests age the history instead of sleeping.
  const submit = async (id: string, chapter: number, answer: unknown) => { await db.submission.updateMany({ where: { teamId: id }, data: { createdAt: new Date(0) } }); return service.mutateTeam(id, chapter, "submit", answer); };
  const state = (id: string) => service.teamState(id);
  const post = (body: unknown) => new NextRequest(`${origin}/api/game`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const put = (body: unknown) => new NextRequest(`${origin}/api/game/drafts`, { method: "PUT", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const get = (chapter: number) => new NextRequest(`${origin}/api/game/drafts?chapter=${chapter}`);

  beforeAll(async () => {
    temp = await createTempDatabase("scoring");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url;
    process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = origin;
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); service = await import("../src/lib/game/service"); drafts = await import("../src/lib/game/drafts.server");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) } });
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("zero-point chapter: nothing earned, no task rows, history recorded", async () => {
    const id = await mk(); const result = await submit(id, 0, wrongInbox);
    expect(result).toMatchObject({ accepted: false, partial: false, awarded: 0, chapterRaw: 0, chapterMax: 15 });
    expect((await state(id)).score).toBe(0); expect(await db.taskScore.count({ where: { teamId: id } })).toBe(0);
    expect(await db.submission.findFirst({ where: { teamId: id } })).toMatchObject({ reason: "incorrect", scoringVersion: 2, awarded: 0 });
  });
  it("partially correct task awards only the verified criteria", async () => {
    const id = await mk(); const result = await submit(id, 0, inbox(["emailId", "databaseId"]));
    expect(result).toMatchObject({ accepted: false, partial: true, awarded: 5, chapterRaw: 5 });
    expect((result as { tasks: { id: string; earned: number }[] }).tasks.map(t => [t.id, t.earned])).toEqual([["inbox.entry", 2], ["inbox.identity", 0], ["inbox.impact", 3]]);
    const s = await state(id); expect(s.score).toBe(5); expect(s.progress.chapters[0].completedAt).toBeNull(); expect(s.current).toBe(0);
    expect(JSON.stringify(result)).not.toContain(inboxAnswers.A.emailId); // no answer or criterion ids leak back
  });
  it("fully correct task completes the chapter", async () => {
    const id = await mk(); const result = await submit(id, 0, inboxAnswers.A);
    expect(result).toMatchObject({ accepted: true, awarded: 15, chapterRaw: 15 });
    const s = await state(id); expect(s.progress.chapters[0].completedAt).not.toBeNull(); expect(s.current).toBe(1);
  });
  it("repeated submissions never duplicate points", async () => {
    const id = await mk(); const answer = inbox(["emailId"]);
    expect((await submit(id, 0, answer)) as object).toMatchObject({ awarded: 2 });
    expect(await submit(id, 0, answer)).toMatchObject({ awarded: 0, chapterRaw: 2 });
    expect(await submit(id, 0, answer)).toMatchObject({ awarded: 0, chapterRaw: 2 });
    expect((await state(id)).score).toBe(2);
    const done = await mk(); await submit(done, 0, inboxAnswers.A);
    expect((await submit(done, 0, inboxAnswers.A)).error).toMatch(/locked or already completed/);
    expect((await state(done)).score).toBe(15);
  });
  it("an improved answer awards only the difference; a worse one keeps earned points", async () => {
    const id = await mk();
    expect(await submit(id, 0, inbox(["emailId", "databaseId"]))).toMatchObject({ awarded: 5, chapterRaw: 5 });
    expect(await submit(id, 0, inbox(["emailId", "databaseId", "deliveryId", "snapshotId"]))).toMatchObject({ awarded: 4, chapterRaw: 9 });
    const before = await db.taskScore.findMany({ where: { teamId: id }, orderBy: { taskId: "asc" } });
    expect(await submit(id, 0, wrongInbox)).toMatchObject({ awarded: 0, chapterRaw: 9, accepted: false });
    expect(await submit(id, 0, inbox(["sessionId"]))).toMatchObject({ awarded: 3, chapterRaw: 12 }); // a different partial adds, never subtracts
    expect((await state(id)).score).toBe(12);
    const after = await db.taskScore.findMany({ where: { teamId: id }, orderBy: { taskId: "asc" } });
    expect(after.find(r => r.taskId === "inbox.entry")).toMatchObject({ earned: 6 }); expect(before.find(r => r.taskId === "inbox.entry")).toMatchObject({ earned: 6 });
  });
  it("concurrent duplicate submissions score exactly once", async () => {
    const id = await mk(); const answer = inbox(["emailId", "authenticationId"]);
    const results = await Promise.all(Array.from({ length: 12 }, () => service.mutateTeam(id, 0, "submit", answer)));
    expect(results.reduce((sum, r) => sum + ("awarded" in r ? r.awarded as number : 0), 0)).toBe(5);
    expect((await state(id)).score).toBe(5);
    expect(await db.taskScore.count({ where: { teamId: id } })).toBe(2);
    expect(await db.submission.count({ where: { teamId: id, scoringVersion: 2 } })).toBe(1);
  });
  it("chapter 1 -> 2 unlocks exactly at 8/15, stays locked at 7, is not forced, and is audited once", async () => {
    const below = await mk();
    expect(await submit(below, 0, inbox(["emailId", "deliveryId", "authenticationId"]))).toMatchObject({ chapterRaw: 7, unlocked: [] });
    expect((await state(below)).unlocked).toEqual([true, false, false, false, false]);
    expect((await submit(below, 1, trailAnswers.A)).error).toMatch(/locked/);
    expect((await service.mutateTeam(below, 1, "hint", null)).error).toMatch(/locked|unavailable/);
    expect(await db.auditLog.count({ where: { actor: below, action: "chapter-unlock" } })).toBe(0);
    const id = await mk();
    expect(await submit(id, 0, inbox(["emailId", "authenticationId", "sessionId"]))).toMatchObject({ chapterRaw: 8, unlocked: [1] }); // 2 + 3 + 3
    const s = await state(id);
    expect(s.unlocked).toEqual([true, true, false, false, false]); expect(s.current).toBe(0); // not forced out of chapter 1
    expect(s.progress.chapters[1].unlockedAt).not.toBeNull();
    expect(await submit(id, 0, inbox(["emailId", "authenticationId", "sessionId", "databaseId"]))).toMatchObject({ unlocked: [] });
    expect(await db.auditLog.count({ where: { actor: id, action: "chapter-unlock" } })).toBe(1);
  });
  it("Trail 13/25, Insider 13/25 and Containment 10/20 unlock their successors exactly at threshold (real submissions)", async () => {
    const trail = await import("../src/lib/game/trail-access.server");
    const T = trailAnswers.A, I = insiderAnswers.A, C = containmentAnswers.A;
    const trailWith = (keys: Record<string, unknown>) => ({ ...wrongTrail, ...keys });
    const insiderWith = (keys: object) => ({ kind: "conclusion", employeeId: "EMP-A-99", actionId: "POL-A-99", supportingEvidenceIds: ["CUST-A-01", "MSG-A-INTERVIEW", "TIME-A-01"], ...keys });
    const plan = (keys: object) => ({ ...C, account: "x@nexus.example", sessionId: "x-wrong", immediateActions: ["ACT-A-05"], recoveryOrder: ["REC-A-05"], supportingEvidenceIds: ["x-1", "x-2", "x-3", "x-4", "x-5"], ...keys });
    const cases = [
      { chapter: 1, below: trailWith({ account: T.account, sessionId: T.sessionId, supportingEvidenceIds: [T.supportingEvidenceIds[0], T.supportingEvidenceIds[1], "x-3"] }), belowRaw: 12, exact: trailWith({ account: T.account, sessionId: T.sessionId, supportingEvidenceIds: [T.supportingEvidenceIds[0], "x-2", T.supportingEvidenceIds[2]] }), exactRaw: 13 },
      { chapter: 2, below: insiderWith({ employeeId: I.employeeId, supportingEvidenceIds: [I.supportingEvidenceIds[0], "CUST-A-01", "TIME-A-01"] }), belowRaw: 12, exact: insiderWith({ actionId: I.actionId, supportingEvidenceIds: [I.supportingEvidenceIds[1], I.supportingEvidenceIds[2], "CUST-A-01"] }), exactRaw: 13 },
      { chapter: 3, below: plan({ eventOrder: C.eventOrder, immediateActions: C.immediateActions.slice(0, 3) }), belowRaw: 9, exact: plan({ eventOrder: C.eventOrder, immediateActions: C.immediateActions }), exactRaw: 10 },
    ];
    for (const { chapter, below, belowRaw, exact, exactRaw } of cases) {
      const base = { chapters: points.map((_, i) => (i < chapter ? { score: [8, 13, 13][i] } : {})) };
      const locked = await mk(base), open = await mk(base);
      await db.insiderAccess.createMany({ data: [locked, open].map(teamId => ({ teamId, fragmentA: `fa-${teamId}`, fragmentB: `fb-${teamId}`, unlockedAt: new Date() })) });
      expect(await submit(locked, chapter, below)).toMatchObject({ chapterRaw: belowRaw, unlocked: [] });
      expect((await state(locked)).unlocked[chapter + 1]).toBe(false);
      expect(await submit(open, chapter, exact)).toMatchObject({ chapterRaw: exactRaw, unlocked: [chapter + 1] });
      expect((await state(open)).unlocked[chapter + 1]).toBe(true);
    }
    const id = await mk({ chapters: [{ score: 8 }] });
    jar.clear(); await auth.login("team", id, code);
    expect((await trail.trailAccess()).status).toBe(200); // evidence endpoint follows the unlock, not chapter completion
    const sealed = await mk({ chapters: [{ score: 8 }, { score: 13 }] });
    await db.insiderAccess.create({ data: { teamId: sealed, fragmentA: "fa-sealed", fragmentB: "fb-sealed" } });
    expect((await state(sealed)).unlocked[2]).toBe(true);
    expect((await submit(sealed, 2, I)).error).toMatch(/[Uu]nlock the dossier/); // physical Fragment A/B requirement is not bypassed
    jar.clear(); await auth.login("team", sealed, code);
    const insider = await import("../src/lib/game/insider-access.server");
    expect(await insider.insiderAccess()).toMatchObject({ status: 200, dossier: null });
    jar.clear(); await auth.logout();
  });
  it("Containment 10/20 unlocks Final Verdict; 9 does not; Verdict works under partial progression without leaking the key", async () => {
    const verdict = await import("../src/lib/game/verdict-access.server");
    const partial = await mk({ chapters: [{ score: 8 }, { score: 13 }, { score: 13 }, { score: 10 }] });
    const below = await mk({ chapters: [{ score: 8 }, { score: 13 }, { score: 13 }, { score: 9 }] });
    jar.clear(); await auth.login("team", below, code); expect((await verdict.verdictAccess()).status).toBe(403);
    jar.clear(); await auth.login("team", partial, code);
    const access = await verdict.verdictAccess(); expect(access.status).toBe(200);
    expect(JSON.stringify((access as { evidence: unknown }).evidence)).not.toMatch(/evidenceMap|contradiction|attackerAttribution/);
    const partialVerdict = { ...verdictAnswers.A, hypothesisId: "HYP-A-00", rejected: { ...verdictAnswers.A.rejected, hypothesisId: "HYP-A-00" } };
    const result = await submit(partial, 4, partialVerdict);
    expect(result).toMatchObject({ accepted: false, partial: true }); expect((result as { awarded: number }).awarded).toBe(13);
    expect((await state(partial)).progress.completedAt).toBeNull();
    jar.clear(); await auth.logout();
  });
  it("revisiting unlocked chapters keeps scored work; an earlier chapter can still be improved", async () => {
    const id = await mk({ chapters: [{ score: 8 }] });
    expect(await submit(id, 1, { ...wrongTrail, sourceIp: trailAnswers.A.sourceIp })).toMatchObject({ awarded: 4, chapterRaw: 4 });
    expect(await submit(id, 0, inboxAnswers.A)).toMatchObject({ accepted: true, awarded: 7, chapterRaw: 15 });
    expect(await submit(id, 1, trailAnswers.A)).toMatchObject({ accepted: true, awarded: 21, chapterRaw: 25 });
    const s = await state(id); expect(s.progress.chapters.map(c => c.score)).toEqual([15, 25, 0, 0, 0]); expect(s.score).toBe(40);
    expect(s.tasks[1].map(t => t.earned)).toEqual([8, 10, 7]);
  });
  it("hint deductions never reduce raw unlock progress; total is deducted separately", async () => {
    const id = await mk();
    await service.mutateTeam(id, 0, "hint", null); await service.mutateTeam(id, 0, "hint", null);
    expect(await submit(id, 0, inbox(["emailId", "authenticationId", "sessionId", "databaseId"]))).toMatchObject({ chapterRaw: 11, unlocked: [1] });
    const s = await state(id); expect(s.score).toBe(2); expect(s.progress.chapters[0].score).toBe(11); expect(s.unlocked[1]).toBe(true);
    expect((await service.mutateTeam(id, 0, "hint", null)).error).toBeDefined(); // maximum two
  });
  it("the Tamper Alert bonus is awarded once and totals are capped at 105", async () => {
    const id = await mk();
    expect(await submit(id, 0, { kind: "tamper", tamper: tamperAnswer("A") })).toMatchObject({ tamperAwarded: true });
    expect(await submit(id, 0, { kind: "tamper", tamper: tamperAnswer("A") })).toMatchObject({ tamperAwarded: false });
    expect((await state(id)).progress.bonus).toBe(5); expect(await db.auditLog.count({ where: { actor: id, action: "tamper-alert" } })).toBe(1);
    const full = await mk({ chapters: points.map(score => ({ score, completedAt: 1 })), bonus: 5, completedAt: 1 });
    expect((await state(full)).score).toBe(105);
  });
  it("client-supplied scores are rejected or ignored", async () => {
    const id = await mk(); jar.clear(); await auth.login("team", id, code);
    const game = await import("../src/app/api/game/route");
    expect((await game.POST(post({ action: "submit", chapter: 0, score: 15, answer: inboxAnswers.A }))).status).toBe(400);
    expect((await game.POST(post({ action: "submit", chapter: 0, answer: { ...inboxAnswers.A, score: 15 } }))).status).toBe(200);
    const s = await state(id); expect(s.score).toBe(0); expect(s.progress.chapters[0].score).toBe(0);
    jar.clear(); await auth.logout();
  });
  it("organizer override: audited, never lowers earned points, advances the right chapter", async () => {
    const id = await mk({ chapters: [{ score: 3 }] });
    await service.control("unlock", id, "Organizer confirmed a stuck workspace");
    let s = await state(id); expect(s.progress.chapters[0]).toMatchObject({ score: 3, override: true }); expect(s.unlocked[1]).toBe(true); expect(s.current).toBe(1);
    const open = await mk({ chapters: [{ score: 9 }, { score: 5 }] });
    await service.control("unlock", open, "Organizer confirmed a stuck workspace");
    s = await state(open); expect(s.progress.chapters[1]).toMatchObject({ score: 5, override: true }); expect(s.unlocked[2]).toBe(true); expect(s.progress.chapters[0].completedAt).toBeNull();
    expect(await db.auditLog.count({ where: { actor: "organizer", action: "unlock", detail: { contains: `"teamId":"${id}"` } } })).toBe(1);
    await expect(service.control("unlock", id, "")).rejects.toThrow();
  });
  it("legacy full-completion records keep their points; historical submissions are not rewritten", async () => {
    const id = await mk({ chapters: [{ score: 15, hints: 1, completedAt: 5 }], bonus: 5 });
    await db.submission.create({ data: { teamId: id, chapter: 0, accepted: true, reason: "completed", answer: "{}", createdAt: new Date(1000) } });
    const historical = await db.submission.findMany({ where: { teamId: id } });
    expect((await state(id)).score).toBe(17); expect((await state(id)).unlocked).toEqual([true, true, false, false, false]);
    expect((await submit(id, 0, inboxAnswers.A)).error).toMatch(/already completed/); // no double award
    expect(await submit(id, 1, { ...wrongTrail, account: trailAnswers.A.account })).toMatchObject({ awarded: 4 });
    const s = await state(id); expect(s.progress.chapters[0]).toMatchObject({ score: 15, hints: 1, completedAt: 5 }); expect(s.score).toBe(21);
    const now = (await db.submission.findUnique({ where: { id: historical[0].id } }))!;
    expect({ ...now, createdAt: 0 }).toEqual({ ...historical[0], createdAt: 0 }); // only the cooldown timestamp is aged by this test's helper
    expect(historical[0].scoringVersion).toBeNull();
  });
  it("the per-chapter scored-attempt cap blocks answer probing without touching other chapters", async () => {
    const id = await mk({ chapters: [{ score: 8 }] });
    await db.submission.createMany({ data: Array.from({ length: MAX_SCORED_ATTEMPTS }, () => ({ teamId: id, chapter: 0, accepted: false, reason: "partial", scoringVersion: 2, createdAt: new Date(0) })) });
    expect((await submit(id, 0, inboxAnswers.A)).error).toMatch(/limit/);
    expect((await state(id)).score).toBe(8);
    expect(await submit(id, 1, trailAnswers.A)).toMatchObject({ accepted: true });
  });
  it("every chapter rejects submissions after the global deadline, server-side", async () => {
    const id = await mk({ chapters: points.map((_, i) => ({ score: i < 4 ? [8, 13, 13, 10][i] : 0 })) });
    await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() - 1000) } });
    try {
      const sample = [inboxAnswers.A, trailAnswers.A, insiderAnswers.A, containmentAnswers.A, verdictAnswers.A];
      for (const chapter of [0, 1, 2, 3, 4]) expect((await submit(id, chapter, sample[chapter])).error).toBe("Round is not active");
      expect((await state(id)).score).toBe(44);
      expect(await drafts.saveDraft(id, { chapter: 0, taskId: "inbox.entry", data: { a: "b" }, baseVersion: 0 })).toMatchObject({ ok: false, status: 403 });
    } finally { await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() + 3_600_000) } }); }
  });
  it("A, B and C variants each score partially against their own evidence", async () => {
    for (const variant of ["B", "C"] as const) {
      const id = await mk({}, variant), a = inboxAnswers[variant];
      expect(await submit(id, 0, { ...a, emailId: "x-wrong", databaseId: "x-wrong" })).toMatchObject({ awarded: 10 });
      expect(await submit(id, 0, a)).toMatchObject({ accepted: true, chapterRaw: 15 });
    }
  });

  describe("drafts", () => {
    it("save, restore, update; never scored and never a submission", async () => {
      const id = await mk(); const submissions = await db.submission.count();
      const first = await drafts.saveDraft(id, { chapter: 0, taskId: "inbox.entry", data: { emailId: inboxAnswers.A.emailId, note: "check headers" }, baseVersion: 0 });
      expect(first).toMatchObject({ ok: true, draft: { version: 1 } });
      const second = await drafts.saveDraft(id, { chapter: 0, taskId: "inbox.entry", data: { emailId: "MAIL-A-03" }, baseVersion: 1 });
      expect(second).toMatchObject({ ok: true, draft: { version: 2, data: { emailId: "MAIL-A-03" } } });
      await drafts.saveDraft(id, { chapter: 0, taskId: "notes", data: { text: "free notes" }, baseVersion: 0 });
      expect((await drafts.listDrafts(id, 0))!.map(d => [d.taskId, d.version])).toEqual([["inbox.entry", 2], ["notes", 1]]);
      expect((await state(id)).score).toBe(0); expect(await db.taskScore.count({ where: { teamId: id } })).toBe(0); expect(await db.submission.count()).toBe(submissions);
    });
    it("concurrent edits: exactly one writer wins each version, stale writers get the newer copy", async () => {
      const id = await mk(); const save = (data: unknown, baseVersion: number) => drafts.saveDraft(id, { chapter: 0, taskId: "inbox.entry", data, baseVersion });
      const creates = await Promise.all(Array.from({ length: 10 }, (_, i) => save({ writer: i }, 0)));
      expect(creates.filter(r => r.ok)).toHaveLength(1);
      const updates = await Promise.all(Array.from({ length: 10 }, (_, i) => save({ editor: i }, 1)));
      expect(updates.filter(r => r.ok)).toHaveLength(1);
      const stale = await save({ late: true }, 1);
      expect(stale).toMatchObject({ ok: false, status: 409, current: { version: 2 } });
      expect((await drafts.listDrafts(id, 0))![0].version).toBe(2);
    });
    it("validates payloads, size, tasks and locked chapters", async () => {
      const id = await mk(); const base = { chapter: 0, taskId: "inbox.entry", data: { a: "b" }, baseVersion: 0 };
      expect(await drafts.saveDraft(id, { ...base, taskId: "unknown" })).toMatchObject({ ok: false, status: 400 });
      expect(await drafts.saveDraft(id, { ...base, taskId: "trail.source" })).toMatchObject({ ok: false, status: 400 });
      expect(await drafts.saveDraft(id, { ...base, data: { nested: { x: 1 } } })).toMatchObject({ ok: false, status: 400 });
      expect(await drafts.saveDraft(id, { ...base, score: 15 })).toMatchObject({ ok: false, status: 400 });
      expect(await drafts.saveDraft(id, { ...base, data: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, "x".repeat(900)])) })).toMatchObject({ ok: false, status: 413 });
      expect(await drafts.saveDraft(id, { chapter: 1, taskId: "trail.source", data: { a: "b" }, baseVersion: 0 })).toMatchObject({ ok: false, status: 403 });
      expect(await drafts.listDrafts(id, 1)).toBeNull();
    });
    it("survives logout/login and is isolated per team through the HTTP route", async () => {
      const route = await import("../src/app/api/game/drafts/route");
      const a = await mk(), b = await mk();
      jar.clear(); await auth.login("team", a, code);
      expect((await route.PUT(put({ chapter: 0, taskId: "inbox.entry", data: { secret: "team-a-only" }, baseVersion: 0 }))).status).toBe(200);
      expect((await route.PUT(put({ chapter: 0, taskId: "inbox.entry", data: {}, baseVersion: 0, teamId: b }))).status).toBe(400);
      await auth.logout(); await auth.login("team", a, code);
      expect(await (await route.GET(get(0))).json()).toMatchObject({ drafts: [{ taskId: "inbox.entry", data: { secret: "team-a-only" }, version: 1 }] });
      await auth.logout(); await auth.login("team", b, code);
      expect(await (await route.GET(get(0))).json()).toEqual({ drafts: [] });
      expect((await route.PUT(put({ chapter: 0, taskId: "inbox.entry", data: { x: "y" }, baseVersion: 1 }))).status).toBe(409); // cannot overwrite A's row
      expect(JSON.stringify(await (await route.PUT(put({ chapter: 0, taskId: "inbox.entry", data: { x: "y" }, baseVersion: 1 }))).json())).not.toContain("team-a-only");
      expect((await route.GET(get(3))).status).toBe(403);
      expect((await route.GET(get(9))).status).toBe(400);
      await auth.logout();
      expect((await route.GET(get(0))).status).toBe(401);
      expect((await route.PUT(put({}))).status).toBe(401);
      await auth.login("admin", "organizer", code);
      expect((await route.GET(get(0))).status).toBe(401); // organizer sessions are not team sessions
      jar.clear();
    });
  });
});
