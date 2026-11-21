import "server-only";
import { z } from "zod";
import { db, serializable } from "@/lib/db";
import { clockNow, R2Error } from "./common.server";
import { availability, visible, type R2Clock } from "./clock";
import { criterionPoints, CONTENT_VERSION, MAX_ATTEMPTS_PER_TASK, MIN_SUBMIT_GAP_MS, partMax, r2Catalog, r2TaskById, taskMax, unitMax, UNITS } from "./catalog";
import { CASE_BRIEF, units } from "./content.server";
import { gradeValidated, validateAnswer } from "./tasks.server";
import { answerHash, stableStringify } from "./safe-json";

export const DRAFT_MAX_BYTES = 8192;
export const NOTES_TASK = "notes";

const clockView = (c: R2Clock) => ({ phase: c.phase, serverNow: Date.now(), elapsedMs: c.elapsedMs, startsAt: c.startsAt, partAClosesAt: c.partAClosesAt, endsAt: c.endsAt, releasedIncidents: c.releasedIncidents, partBReleased: c.partBReleased, nextEvent: c.nextEvent });
async function scoreRows(teamId: string) {
  const rows = await db.r2TaskScore.findMany({ where: { teamId } });
  const by = new Map(rows.map(r => [r.taskId, r.earned]));
  const tasks = r2Catalog.map(t => ({ id: t.id, part: t.part, unit: t.unit, title: t.title, earned: by.get(t.id) ?? 0, max: taskMax(t) }));
  const sum = (part: "A" | "B") => tasks.filter(t => t.part === part).reduce((n, t) => n + t.earned, 0);
  return { tasks, partA: sum("A"), partB: sum("B"), total: sum("A") + sum("B"), partAMax: partMax("A"), partBMax: partMax("B"), max: partMax("A") + partMax("B") };
}
/** Server-generated round status plus this team's own scoring state. Never includes criterion ids or any answer information. */
export async function r2Status(teamId: string) {
  const { clock } = await clockNow();
  const scores = await scoreRows(teamId);
  return { clock: clockView(clock), score: { partA: scores.partA, partB: scores.partB, total: scores.total, partAMax: scores.partAMax, partBMax: scores.partBMax, max: scores.max }, tasks: scores.tasks.map(t => ({ ...t, availability: availability(t, clock) })), units: { A: UNITS.A.map((title, i) => ({ unit: i + 1, title, max: unitMax("A", i + 1), released: clock.releasedIncidents.includes(i + 1) })), B: UNITS.B.map((title, i) => ({ unit: i + 1, title, max: unitMax("B", i + 1), released: clock.partBReleased })) }, hints: "disabled" };
}
/** Released evidence and task prompts only. Anything not yet released by the server clock is absent from the response. */
export async function r2Bundle() {
  const { clock } = await clockNow();
  const released = units.filter(u => visible(u, clock));
  return { clock: clockView(clock), brief: released.length ? CASE_BRIEF : null, contentVersion: CONTENT_VERSION, units: released.map(u => ({ part: u.part, unit: u.unit, title: u.title, story: u.story, records: u.records, tasks: u.tasks.map(t => ({ ...t, max: taskMax(r2TaskById.get(t.id)!), availability: availability(u, clock) })) })) };
}

export type SubmitOutcome = { duplicate: boolean; accepted: boolean; awarded: number; task: { id: string; earned: number; max: number }; score: { partA: number; partB: number; total: number } };
/**
 * Graded, server-authoritative submission. One serializable transaction: availability is evaluated on the SERVER clock at the moment of
 * decision, so a deadline can never be beaten by a slow request. Re-submitting an identical answer is free and awards nothing.
 * Earned criteria are a monotonic union: a worse retry can never remove points, and no criterion pays twice.
 */
export async function submitTask(teamId: string, taskId: string, rawAnswer: unknown): Promise<SubmitOutcome> {
  const task = r2TaskById.get(taskId);
  if (!task) throw new R2Error(400, "Unknown task");
  const valid = validateAnswer(taskId, rawAnswer);
  if (!valid.ok) throw new R2Error(400, "Invalid answer format");
  const hash = answerHash(valid.data), json = stableStringify(valid.data);
  return serializable(async tx => {
    const finalist = await tx.r2Finalist.findUnique({ where: { teamId }, select: { status: true } });
    if (finalist?.status !== "active") throw new R2Error(403, "Round 2 is open to confirmed finalists only");
    const { clock, now } = await clockNow(tx);
    const state = availability(task, clock);
    if (state !== "open") throw new R2Error(403, state === "not_released" ? "This challenge has not been released yet" : "Submissions for this part are closed");
    const stored = await tx.r2TaskScore.findMany({ where: { teamId } });
    const summarize = (earnedNow: number, tId: string) => {
      const by = new Map(stored.map(r => [r.taskId, r.earned])); by.set(tId, earnedNow);
      const sum = (part: "A" | "B") => r2Catalog.filter(t => t.part === part).reduce((n, t) => n + (by.get(t.id) ?? 0), 0);
      return { partA: sum("A"), partB: sum("B"), total: sum("A") + sum("B") };
    };
    const mine = stored.find(r => r.taskId === taskId);
    const max = taskMax(task);
    if (await tx.r2Submission.findFirst({ where: { teamId, taskId, answerHash: hash }, select: { id: true } }))
      return { duplicate: true, accepted: (mine?.earned ?? 0) >= max, awarded: 0, task: { id: taskId, earned: mine?.earned ?? 0, max }, score: summarize(mine?.earned ?? 0, taskId) };
    if ((mine?.earned ?? 0) >= max) throw new R2Error(409, "Task already complete");
    const last = await tx.r2Submission.findFirst({ where: { teamId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (last && now - last.createdAt.getTime() < MIN_SUBMIT_GAP_MS) throw new R2Error(429, "Please wait between submissions.", { retryAfter: Math.max(1, Math.ceil((MIN_SUBMIT_GAP_MS - (now - last.createdAt.getTime())) / 1000)) });
    if (await tx.r2Submission.count({ where: { teamId, taskId } }) >= MAX_ATTEMPTS_PER_TASK) throw new R2Error(429, "Attempt limit reached for this task. Ask an organizer to review it.");
    const had = new Set<string>(mine ? JSON.parse(mine.criteria) : []);
    const fresh = gradeValidated(taskId, valid.data).filter(id => !had.has(id));
    const all = [...had, ...fresh];
    const earned = all.reduce((n, id) => n + (criterionPoints.get(id) ?? 0), 0);
    const awarded = earned - (mine?.earned ?? 0);
    if (fresh.length) {
      const at = new Date(now);
      await tx.r2TaskScore.upsert({ where: { teamId_taskId: { teamId, taskId } }, create: { teamId, taskId, part: task.part, earned, max, criteria: JSON.stringify(all), firstScoredAt: at, lastAwardAt: at }, update: { earned, criteria: JSON.stringify(all), lastAwardAt: at } });
    }
    await tx.r2Submission.create({ data: { teamId, taskId, awarded, taskEarned: earned, criteria: JSON.stringify(fresh), answerHash: hash, answer: json, contentVersion: CONTENT_VERSION, createdAt: new Date(now) } });
    return { duplicate: false, accepted: earned >= max, awarded, task: { id: taskId, earned, max }, score: summarize(earned, taskId) };
  });
}

// ---------- drafts ----------
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
function boundedValue(v: unknown, depth = 0, budget = { n: 0 }): boolean {
  if (++budget.n > 400 || depth > 4) return false;
  if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return true;
  if (typeof v === "string") return v.length <= 1000;
  if (Array.isArray(v)) return v.length <= 60 && v.every(x => boundedValue(x, depth + 1, budget));
  if (typeof v === "object") return Object.entries(v as object).every(([k, x]) => k.length >= 1 && k.length <= 60 && !DANGEROUS.has(k) && boundedValue(x, depth + 1, budget));
  return false;
}
const draftRequest = z.object({ taskId: z.string().min(1).max(60), data: z.record(z.string().min(1).max(60), z.unknown()).refine(d => boundedValue(d), "Draft data out of bounds"), baseVersion: z.number().int().min(0).max(1_000_000) }).strict();
export type R2DraftResult =
  | { ok: true; draft: { taskId: string; data: unknown; version: number } }
  | { ok: false; status: 400 | 403 | 409 | 413; error: string; current?: { data: unknown; version: number } | null };
const draftView = (row: { taskId: string; data: string; version: number }) => ({ taskId: row.taskId, data: JSON.parse(row.data) as unknown, version: row.version });

/** The team's own drafts, restricted to tasks the server clock has released (drafts cannot probe unreleased challenges). Readable after close. */
export async function listR2Drafts(teamId: string) {
  const { clock } = await clockNow();
  const rows = await db.r2Draft.findMany({ where: { teamId }, orderBy: { taskId: "asc" } });
  return rows.filter(r => r.taskId === NOTES_TASK || (r2TaskById.has(r.taskId) && visible(r2TaskById.get(r.taskId)!, clock))).map(draftView);
}
/** Compare-and-set draft save. Awards nothing and never touches scores. Writable only while the task's part is open. */
export async function saveR2Draft(teamId: string, input: unknown): Promise<R2DraftResult> {
  const parsed = draftRequest.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "Invalid draft" };
  const { taskId, data, baseVersion } = parsed.data;
  const task = r2TaskById.get(taskId);
  if (taskId !== NOTES_TASK && !task) return { ok: false, status: 400, error: "Unknown task" };
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > DRAFT_MAX_BYTES) return { ok: false, status: 413, error: "Draft too large" };
  const { clock } = await clockNow();
  if (task ? availability(task, clock) !== "open" : clock.phase !== "part_a" && clock.phase !== "part_b") return { ok: false, status: 403, error: "This task is not open for editing" };
  const finalist = await db.r2Finalist.findUnique({ where: { teamId }, select: { status: true } });
  if (finalist?.status !== "active") return { ok: false, status: 403, error: "Round 2 is open to confirmed finalists only" };
  const key = { teamId, taskId };
  const conflict = async (): Promise<R2DraftResult> => { const row = await db.r2Draft.findUnique({ where: { teamId_taskId: key } }); return { ok: false, status: 409, error: "Draft changed elsewhere", current: row ? { data: JSON.parse(row.data), version: row.version } : null }; };
  if (baseVersion === 0) {
    try { return { ok: true, draft: draftView(await db.r2Draft.create({ data: { ...key, data: json } })) }; }
    catch (error) { if ((error as { code?: string }).code === "P2002") return conflict(); throw error; }
  }
  const updated = await db.r2Draft.updateMany({ where: { ...key, version: baseVersion }, data: { data: json, version: { increment: 1 } } });
  if (updated.count !== 1) return conflict();
  return { ok: true, draft: draftView(await db.r2Draft.findUniqueOrThrow({ where: { teamId_taskId: key } })) };
}
