import "server-only";
import { db, serializable } from "@/lib/db";
import { audit, R2Error, readSession, requireAdmin } from "../common.server";
import { FORMAT, openClock, POINTS } from "./format";
import { terminalReview } from "./terminal.server";
import { rankResults, type MarkCell, type ResultRow } from "./marking";

// Round 2 jury marking (60-minute format). Injects 1, 3 and 4 are marked on paper by the jury and typed in here; Inject 2 is the
// server-calculated terminal score and is READ-ONLY (there is no field, action or parameter that can override it).
// A missing mark is pending, never zero. A total exists only when all four parts exist and the round is over.
export const PAPER_INJECTS = [1, 3, 4] as const;

async function current() {
  const row = await readSession();
  const started = !!row.startsAt && row.format === FORMAT;
  return { row, started, phase: started ? openClock(row).phase : "not_started" as const };
}

/** Organizer-only marking board: every active finalist with the four parts, pending flags, totals and the provisional order. */
export async function markingBoard() {
  await requireAdmin();
  const { row, started, phase } = await current();
  const [finalists, term, marks] = await Promise.all([
    db.r2Finalist.findMany({ where: { status: "active" }, include: { team: { select: { name: true } } }, orderBy: { seed: "asc" } }),
    started ? terminalReview() : Promise.resolve(null),
    started ? db.r2PaperMark.findMany({ where: { sessionStartsAt: row.startsAt! } }) : Promise.resolve([]),
  ]);
  const cell = (teamId: string, inject: number): MarkCell => { const m = marks.find(x => x.teamId === teamId && x.inject === inject); return m ? { score: m.score, marker: m.marker, at: m.updatedAt.toISOString() } : null; };
  const rows = rankResults(finalists.map(f => {
    const t = term?.teams.find(x => x.teamId === f.teamId);
    return { teamId: f.teamId, name: f.team.name, seed: f.seed, i1: cell(f.teamId, 1), i3: cell(f.teamId, 3), i4: cell(f.teamId, 4),
      terminal: { score: t?.score ?? null, final: phase === "complete", untouched: t?.untouched ?? true, attempts: t?.attempts.length ?? 0, contained: t?.contained ?? 0, lockReason: t?.lockReason ?? "none" } };
  }));
  const complete = rows.filter(r => r.total !== null).length;
  return { phase, started, keyReady: term?.keyReady ?? false, publishedAt: row.resultsPublishedAt?.toISOString() ?? null, max: POINTS, rows, complete,
    canPublish: phase === "complete" && rows.length > 0 && complete === rows.length && !row.resultsPublishedAt };
}

/** Save (or clear, with score null) one jury mark. Validated against the 0-15 maximum, audited with the previous value, refused after publication. */
export async function saveMark(input: { teamId: string; inject: number; score: number | null; marker: string }) {
  await requireAdmin();
  const marker = input.marker.trim();
  if (!(PAPER_INJECTS as readonly number[]).includes(input.inject)) throw new R2Error(400, "Only Injects 1, 3 and 4 are marked by the jury. Inject 2 is scored by the terminal.");
  if (input.score !== null && (!Number.isInteger(input.score) || input.score < 0 || input.score > POINTS.inject1)) throw new R2Error(400, `A mark must be a whole number from 0 to ${POINTS.inject1}`);
  if (marker.length < 2 || marker.length > 40) throw new R2Error(400, "Enter the marker's name or initials (2 to 40 characters)");
  return serializable(async tx => {
    const row = await readSession(tx);
    if (!row.startsAt || row.format !== FORMAT) throw new R2Error(409, "Round 2 has not started: there is nothing to mark yet");
    if (row.resultsPublishedAt) throw new R2Error(409, "Results are published. Marks are locked.");
    const finalist = await tx.r2Finalist.findUnique({ where: { teamId: input.teamId }, select: { status: true } });
    if (finalist?.status !== "active") throw new R2Error(404, "Not an active finalist");
    const key = { teamId_sessionStartsAt_inject: { teamId: input.teamId, sessionStartsAt: row.startsAt, inject: input.inject } };
    const before = await tx.r2PaperMark.findUnique({ where: key });
    if (input.score === null) { if (before) await tx.r2PaperMark.delete({ where: key }); }
    else await tx.r2PaperMark.upsert({ where: key, create: { ...key.teamId_sessionStartsAt_inject, score: input.score, marker }, update: { score: input.score, marker, updatedAt: new Date() } });
    await audit(tx, "organizer", "paper-mark", { teamId: input.teamId, inject: input.inject, from: before?.score ?? null, to: input.score, marker });
    return { teamId: input.teamId, inject: input.inject, score: input.score };
  });
}

/** Publish the Round 2 results. Only after pens down, only when every active finalist is fully marked, once, with a reason. */
export async function publishResults(reason: string) {
  await requireAdmin();
  const why = reason.trim();
  if (why.length < 5 || why.length > 500) throw new R2Error(400, "A reason of 5 to 500 characters is required");
  const board = await markingBoard();
  if (board.publishedAt) throw new R2Error(409, "Results are already published");
  if (board.phase !== "complete") throw new R2Error(409, "Round 2 must be over (pens down) before results can be published");
  if (!board.canPublish) throw new R2Error(409, `Marking is incomplete: ${board.rows.length - board.complete} finalist(s) still pending`);
  return serializable(async tx => {
    const row = await readSession(tx);
    if (row.resultsPublishedAt) throw new R2Error(409, "Results are already published");
    const at = new Date();
    await tx.r2Session.update({ where: { id: 1 }, data: { resultsPublishedAt: at } });
    await audit(tx, "organizer", "publish-results", { reason: why, ranking: board.rows.map(r => ({ teamId: r.teamId, rank: r.rank, total: r.total })) });
    return { publishedAt: at.toISOString() };
  });
}

/** Public-safe published results (rank, team name, total) or null before publication. Callers must still be organizer-authenticated. */
export async function publishedResults(): Promise<{ rank: number; tied: boolean; name: string; total: number }[] | null> {
  const row = await readSession();
  if (!row.resultsPublishedAt) return null;
  const board = await markingBoard();
  return board.rows.filter((r): r is ResultRow & { rank: number; total: number } => r.rank !== null && r.total !== null).map(r => ({ rank: r.rank, tied: r.tied, name: r.name, total: r.total }));
}
