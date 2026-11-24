import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db, serializable } from "@/lib/db";
import { session } from "@/lib/auth";
import { progressSchema, status } from "./engine";
import { qualificationRows } from "./results";
import { csvCell } from "@/lib/csv";
import { enrollFromSnapshot } from "@/lib/round2/enrollment.server";
import { selectTop, SelectionError, type Cand } from "./top10";

async function snapshot(tx: Prisma.TransactionClient) {
  const round = await tx.gameSession.findUnique({ where: { id: 1 } }) ?? { startsAt: null, deadline: null, endedAt: null };
  const teams = await tx.team.findMany({ select: { id: true, name: true, variant: true, participants: true, progress: true } });
  const rows = qualificationRows(teams.map(team => ({ ...team, progress: progressSchema.parse(JSON.parse(team.progress)) })));
  const digest = createHash("sha256").update(JSON.stringify({ round, rows })).digest("hex");
  return { round, rows, digest, roundStatus: status(round) };
}
export async function qualificationReport() {
  if (!await session("admin")) return null;
  return db.$transaction(async tx => {
    const data = await snapshot(tx);
    const confirmation = await tx.auditLog.findFirst({ where: { actor: "organizer", action: "qualification-confirmed", detail: { contains: `"digest":"${data.digest}"` } }, orderBy: { createdAt: "desc" } });
    const overrides = await tx.auditLog.findMany({ where: { actor: "organizer", action: "unlock" }, orderBy: { createdAt: "asc" } });
    return { ...data, confirmation, overrides, label: data.roundStatus !== "finished" ? "PROVISIONAL" : confirmation ? "FINAL / ORGANIZER CONFIRMED" : "FINAL / PENDING ORGANIZER CONFIRMATION" };
  });
}
/** Expected, organizer-facing failure (no `code`, so serializable() never retries it). */
export class AdvanceError extends Error { constructor(public kind: string, message: string) { super(message); } }
const cand = (row: { id: string; name: string; total: number; chapter23: number; hintCount: number; completedAt: number | null }): Cand => ({ id: row.id, name: row.name, total: row.total, chapter23: row.chapter23, hintCount: row.hintCount, completedAt: row.completedAt });

/**
 * Confirm the Top 10 from the saved Round 1 ranking and (by default) advance them to Round 2 in ONE serializable transaction:
 * qualification record (audit) + finalist enrollment. Idempotent per result snapshot: a repeat returns `unchanged` and writes nothing.
 * A tie across the 10th place is never resolved by the system: `tie` must name exactly the open places from the tied group.
 * It never starts Round 2 and never changes a score.
 */
export async function advanceTopTen(input: { reason: string; tie?: string[] }, opts: { enroll: boolean } = { enroll: true }) {
  if (!await session("admin")) throw new AdvanceError("auth", "Organizer authorization required");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new AdvanceError("reason", "Record the review reason (5 to 500 characters).");
  return serializable(async tx => {
    const data = await snapshot(tx);
    if (data.roundStatus !== "finished") throw new AdvanceError("round-open", "Round 1 must be closed before the Top 10 can be confirmed.");
    if (opts.enroll && (await tx.r2Session.findUnique({ where: { id: 1 } }))?.startsAt) throw new AdvanceError("round2-started", "Round 2 has already started. Use standby promotion for roster changes.");
    let selection;
    try { selection = selectTop(data.rows.map(cand), input.tie ?? []); } catch (e) { if (e instanceof SelectionError) throw new AdvanceError(e.code, e.message); throw e; }
    const prior = await tx.auditLog.findFirst({ where: { actor: "organizer", action: "qualification-confirmed", detail: { contains: `"digest":"${data.digest}"` } }, orderBy: { createdAt: "desc" } });
    const snap = { digest: data.digest, top10: selection.top10, standby: selection.standby };
    if (prior) {
      let priorTop: string[] = []; try { priorTop = (JSON.parse(prior.detail) as { top10?: string[] }).top10 ?? []; } catch { /* unreadable record: treated as different */ }
      if (priorTop.length !== selection.top10.length || !selection.top10.every(id => priorTop.includes(id))) throw new AdvanceError("conflict", "These results were already confirmed with a different selection. The recorded decision stands.");
      const enrolled = opts.enroll ? await enrollFromSnapshot(tx, snap) : null;
      return { ...snap, tie: selection.tie, enrolled: enrolled?.enrolled ?? 0, unchanged: true };
    }
    await tx.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ ...snap, reason, advanced: opts.enroll, ...(selection.tie ? { tieDecision: selection.tie } : {}) }) } });
    const enrolled = opts.enroll ? await enrollFromSnapshot(tx, snap) : null;
    return { ...snap, tie: selection.tie, enrolled: enrolled?.enrolled ?? 0, unchanged: false };
  });
}
/** Record-only confirmation (no enrollment). Kept for callers and tests that only need the audit record; same tie rule. */
export async function confirmQualification(reason: string, tie?: string[]) {
  if (!await session("admin")) throw new Error("Organizer authorization required");
  if (reason.trim().length < 5 || reason.length > 500) throw new Error("Review reason required");
  return advanceTopTen({ reason, tie }, { enroll: false });
}
export function qualificationCsv(report: NonNullable<Awaited<ReturnType<typeof qualificationReport>>>) {
  const rows = [["Rank", "Team ID", "Team", "Score", "Hints", "Completed", "Ranking state", "Candidate group", ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} raw`), ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} hints`), ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} deduction`), "Total deduction", "Bonus", "Chapter 2 + 3 raw", "Investigation", "Override chapters"], ...report.rows.map(row => [row.rank, row.id, row.name, row.total, row.hintCount, row.completedAt === null ? "" : new Date(row.completedAt).toISOString(), report.label, row.selection, ...row.rawScores, ...row.progress.chapters.map(chapter => chapter.hints), ...row.deductions, row.totalDeduction, row.bonus, row.chapter23, row.completedAt === null ? "Incomplete" : "Complete", row.overrides.join("; ")])];
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
