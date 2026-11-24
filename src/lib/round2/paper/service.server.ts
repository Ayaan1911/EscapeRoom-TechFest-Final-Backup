import "server-only";
import { serializable } from "@/lib/db";
import { audit, R2Error, readSession, requireAdmin } from "../common.server";
import { readiness } from "../enrollment.server";
import { FORMAT, isRetiredSession, OPEN_BUFFER, OPEN_MS, OPEN_PACE, openClock, TAUNTS, TAUNT_WINDOW_MS } from "./format";
import { INJECT_CONTENT } from "./content-v2.server";
import type { InjectView, OpenStatus } from "./types";

// GHOST RETURNS Part A: the only Round 2 format (60 minutes, four open injects). There is no format choice anywhere.
export const OPEN_VERSION = "case-v2";

/** Participant status: all four injects while the clock runs, nothing before the start or after pens down.
 *  A historical session from the retired 40-minute format is reported as closed (retired) and never resumes. */
export async function participantStatus(now = Date.now()): Promise<OpenStatus> {
  const row = await readSession(), serverNow = new Date(now).toISOString(), startsAt = row.startsAt?.toISOString() ?? null;
  if (isRetiredSession(row)) return { format: FORMAT, serverNow, phase: "complete", startsAt, endsAt: null, retired: true, injects: null };
  const c = openClock(row, now);
  if (c.phase === "not_started") return { format: FORMAT, serverNow, phase: "not_started", startsAt: null, endsAt: null, injects: null };
  if (c.phase === "complete") return { format: FORMAT, serverNow, phase: "complete", startsAt, endsAt: null, endedEarly: c.endedEarly, injects: null };
  const injects: InjectView[] = OPEN_PACE.map(p => ({ n: p.n, title: p.title, pace: { fromMin: p.fromMin, toMin: p.toMin }, content: INJECT_CONTENT[p.n] }));
  return { format: FORMAT, serverNow, phase: "running", startsAt, endsAt: new Date(c.endsAt).toISOString(), injects };
}

/** Organizer view: phase, remaining time, suggested-pacing schedule and the projector taunt (if one is showing). */
export async function paperTiming(now = Date.now()) {
  await requireAdmin();
  const row = await readSession(), retired = isRetiredSession(row), start = row.startsAt?.getTime() ?? null;
  const c = retired ? { phase: "complete" as const, endedEarly: false } : openClock(row, now);
  const schedule = start === null || retired ? null : [...OPEN_PACE.map(p => ({ at: new Date(start + p.fromMin * 60_000).toISOString(), event: `Suggested: Inject ${p.n} · ${p.title} (${p.toMin - p.fromMin} min)` })),
    { at: new Date(start + OPEN_BUFFER.fromMin * 60_000).toISOString(), event: `${OPEN_BUFFER.label} (3 min)` }, { at: new Date(start + OPEN_MS).toISOString(), event: "PENS DOWN · all injects close, terminal locks" }];
  let taunt: string | null = null;
  if (c.phase === "running" && start !== null) { const p = OPEN_PACE.find(x => x.n === c.suggested); if (p && now - (start + p.fromMin * 60_000) < TAUNT_WINDOW_MS) taunt = TAUNTS[p.n]; }
  const endAt = start === null ? null : row.endedAt ? Math.min(row.endedAt.getTime(), start + OPEN_MS) : start + OPEN_MS;
  if (c.phase === "complete" && !retired && endAt !== null && now - endAt < TAUNT_WINDOW_MS * 3) taunt = TAUNTS[5];
  const base = { format: FORMAT, retired, serverNow: new Date(now).toISOString(), phase: c.phase, startsAt: row.startsAt?.toISOString() ?? null, schedule, taunt, chapters: OPEN_PACE.map(p => ({ n: p.n, title: p.title })) };
  if (c.phase === "running") { const p = OPEN_PACE.find(x => x.n === c.suggested);
    return { ...base, chapter: c.suggested, chapterTitle: p ? p.title : OPEN_BUFFER.label, chapterEndsAt: new Date(start! + (p ? p.toMin : OPEN_BUFFER.toMin) * 60_000).toISOString(), endsAt: new Date(c.endsAt).toISOString() }; }
  return { ...base, chapter: null, chapterTitle: null, chapterEndsAt: null, endsAt: c.phase === "complete" && endAt !== null ? new Date(endAt).toISOString() : null };
}

/** Start the 60-minute investigation. Explicit organizer action only, same readiness gate as before. A session can start exactly once. */
export async function startPaper() {
  await requireAdmin();
  const ready = await readiness();
  const blocking = ready.checks.filter(c => !c.ok && c.blocking && c.id !== "content-complete").map(c => c.id);
  if (blocking.length) throw new R2Error(409, "Round 2 is not ready to start", { checks: blocking });
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    if (row?.startsAt || row?.endedAt) throw new R2Error(409, row && isRetiredSession(row) ? "This database holds a session from the retired 40-minute format. It is kept as history and cannot be restarted; use a fresh event database (see the runbook)." : "Round 2 was already started");
    const now = new Date();
    await tx.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: now, contentVersion: OPEN_VERSION, format: FORMAT }, update: { startsAt: now, contentVersion: OPEN_VERSION, format: FORMAT } });
    await audit(tx, "organizer", "start", { startsAt: now.toISOString(), contentVersion: OPEN_VERSION, format: FORMAT });
    return { startsAt: now, endsAt: new Date(now.getTime() + OPEN_MS) };
  });
}
/** Stop now: every inject closes immediately, the terminal locks and PENS DOWN appears. Needs a reason; cannot be undone. */
export async function endPaper(reason: string) {
  await requireAdmin();
  const why = reason?.trim() ?? "";
  if (why.length < 5 || why.length > 500) throw new R2Error(400, "A reason of 5 to 500 characters is required");
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    if (!row || isRetiredSession(row)) throw new R2Error(409, "The investigation is not running");
    const c = openClock(row);
    if (c.phase !== "running") throw new R2Error(409, "The investigation is not running");
    const end = new Date();
    await tx.r2Session.update({ where: { id: 1 }, data: { endedAt: end } });
    await audit(tx, "organizer", "end", { reason: why, format: FORMAT, suggestedAtEnd: c.suggested, startsAt: row.startsAt?.toISOString() });
    return { endedAt: end };
  });
}
