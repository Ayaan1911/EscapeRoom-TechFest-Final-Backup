import "server-only";
import { db, serializable } from "@/lib/db";
import { csvCell } from "@/lib/csv";
import { audit, clockNow, R2Error, requireAdmin } from "./common.server";
import { INCIDENT_RELEASE_MS, PART_A_MS, ROUND_MS } from "./clock";
import { CONTENT_VERSION, partMax, r2Catalog } from "./catalog";
import { explanation } from "./tasks.server";
import { readiness } from "./enrollment.server";
import { rankR2 } from "./ranking";

/** Start the Round 2 clock. Explicit organizer action only; nothing ever starts automatically. Blocked unless readiness has no blocking failures. */
export async function startRound() {
  await requireAdmin();
  const ready = await readiness();
  if (!ready.ready) throw new R2Error(409, "Round 2 is not ready to start", { checks: ready.checks.filter(c => !c.ok && c.blocking).map(c => c.id) });
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    if (row?.startsAt || row?.endedAt) throw new R2Error(409, "Round 2 was already started");
    const now = new Date();
    await tx.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: now, contentVersion: CONTENT_VERSION }, update: { startsAt: now, contentVersion: CONTENT_VERSION } });
    const active = await tx.r2Finalist.findMany({ where: { status: "active" }, select: { teamId: true } });
    await audit(tx, "organizer", "start", { startsAt: now.toISOString(), contentVersion: CONTENT_VERSION, active: active.map(f => f.teamId) });
    return { startsAt: now, partAClosesAt: new Date(now.getTime() + PART_A_MS), endsAt: new Date(now.getTime() + ROUND_MS) };
  });
}
/** End the round now. All submissions close immediately; results stay private until publishResults. */
export async function endRound(reason: string) {
  await requireAdmin();
  const why = reason?.trim() ?? "";
  if (why.length < 5 || why.length > 500) throw new R2Error(400, "A reason of 5 to 500 characters is required");
  return serializable(async tx => {
    const { clock, row, now } = await clockNow(tx);
    if (clock.phase !== "part_a" && clock.phase !== "part_b") throw new R2Error(409, "Round 2 is not running");
    await tx.r2Session.update({ where: { id: 1 }, data: { endedAt: new Date(now) } });
    await audit(tx, "organizer", "end", { reason: why, phaseAtEnd: clock.phase, startsAt: row.startsAt?.toISOString() });
    return { endedAt: new Date(now) };
  });
}
export async function timing() {
  await requireAdmin();
  const { clock, row } = await clockNow();
  const t = row.startsAt?.getTime();
  return { phase: clock.phase, serverNow: new Date(), startsAt: row.startsAt, endedAt: row.endedAt, elapsedMs: clock.elapsedMs, schedule: t === undefined ? null : { incidentReleases: INCIDENT_RELEASE_MS.map((ms, i) => ({ incident: i + 1, at: new Date(t + ms) })), partAClosesAt: new Date(t + PART_A_MS), partBOpensAt: new Date(t + PART_A_MS), endsAt: new Date(t + ROUND_MS) }, nextEvent: clock.nextEvent, resultsPublishedAt: row.resultsPublishedAt };
}
export async function reviewScores() {
  await requireAdmin();
  const [finalists, scores, subs, session] = await Promise.all([db.r2Finalist.findMany({ include: { team: { select: { name: true } } }, orderBy: { seed: "asc" } }), db.r2TaskScore.findMany(), db.r2Submission.groupBy({ by: ["teamId"], _count: true, _max: { createdAt: true } }), db.r2Session.findUnique({ where: { id: 1 } })]);
  return finalists.map(f => {
    const mine = scores.filter(s => s.teamId === f.teamId), sub = subs.find(s => s.teamId === f.teamId);
    const sum = (part: string) => mine.filter(s => s.part === part).reduce((n, s) => n + s.earned, 0);
    return { teamId: f.teamId, name: f.team.name, status: f.status, partA: sum("A"), partB: sum("B"), total: sum("A") + sum("B"), tasks: r2Catalog.map(t => ({ id: t.id, earned: mine.find(s => s.taskId === t.id)?.earned ?? 0 })), submissions: sub?._count ?? 0, lastSubmissionAt: sub?._max.createdAt ?? null, roundStartedAt: session?.startsAt ?? null };
  });
}
export async function auditTrail(limit = 200) {
  await requireAdmin();
  const take = Math.min(Math.max(1, Math.floor(limit)), 500);
  const [events, submissions] = await Promise.all([db.r2Audit.findMany({ orderBy: { createdAt: "desc" }, take }), db.r2Submission.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, teamId: true, taskId: true, awarded: true, taskEarned: true, criteria: true, contentVersion: true, createdAt: true } })]);
  return { events, submissions };
}
/** Answer keys explained per task, for the organizer only (never reachable by a team session). */
export async function solutions() {
  await requireAdmin();
  return r2Catalog.map(t => ({ id: t.id, part: t.part, unit: t.unit, title: t.title, criteria: t.criteria, explanation: explanation(t.id) }));
}
async function rows() {
  const [finalists, scores, session] = await Promise.all([db.r2Finalist.findMany({ include: { team: { select: { name: true } } } }), db.r2TaskScore.findMany(), db.r2Session.findUnique({ where: { id: 1 } })]);
  const start = session?.startsAt?.getTime() ?? null;
  const build = (f: (typeof finalists)[number]) => {
    const mine = scores.filter(s => s.teamId === f.teamId), sum = (part: string) => mine.filter(s => s.part === part).reduce((n, s) => n + s.earned, 0);
    const a = mine.filter(s => s.part === "A" && s.earned > 0);
    return { teamId: f.teamId, name: f.team.name, partA: sum("A"), partB: sum("B"), partAMs: start !== null && a.length ? Math.max(...a.map(s => s.lastAwardAt.getTime())) - start : null, tasks: r2Catalog.map(t => ({ id: t.id, earned: mine.find(s => s.taskId === t.id)?.earned ?? 0, max: Object.values(t.criteria).reduce((x, y) => x + y, 0) })) };
  };
  return { ranked: rankR2(finalists.filter(f => f.status === "active").map(build)), withdrawn: finalists.filter(f => f.status === "withdrawn").map(build), session };
}
/** Final results for organizer review. Only after the round has finished; never visible to teams until published. */
export async function reviewResults() {
  await requireAdmin();
  const { clock } = await clockNow();
  if (clock.phase !== "finished") throw new R2Error(409, "Results can be reviewed after the round has finished");
  const { ranked, withdrawn, session } = await rows();
  return { max: { partA: partMax("A"), partB: partMax("B"), total: partMax("A") + partMax("B") }, rules: "Rank by total, then Part B, then earlier Part A completion (server time of the last Part A scoring submission). Teams equal on all three are flagged tie for organizer adjudication.", ranked, withdrawn, tiesNeedAdjudication: ranked.some(r => r.tie), published: !!session?.resultsPublishedAt, publishedAt: session?.resultsPublishedAt ?? null };
}
export async function resultsCsv() {
  const r = await reviewResults();
  const head = ["Rank", "Tie", "Team ID", "Team", "Part A", "Part B", "Total", "Part A completion ms", ...r2Catalog.map(t => t.id)];
  return [head, ...r.ranked.map(x => [x.rank, x.tie ? "TIE" : "", x.teamId, x.name, x.partA, x.partB, x.total, x.partAMs ?? "", ...x.tasks.map(t => t.earned)])].map(row => row.map(csvCell).join(",")).join("\r\n");
}
/** The ONLY way results become visible to teams. Explicit, one-way, audited. */
export async function publishResults() {
  await requireAdmin();
  return serializable(async tx => {
    const { clock, row, now } = await clockNow(tx);
    if (clock.phase !== "finished") throw new R2Error(409, "Results can only be published after the round has finished");
    if (row.resultsPublishedAt) return { publishedAt: row.resultsPublishedAt, already: true };
    await tx.r2Session.update({ where: { id: 1 }, data: { resultsPublishedAt: new Date(now) } });
    await audit(tx, "organizer", "publish-results", { publishedAt: new Date(now).toISOString() });
    return { publishedAt: new Date(now), already: false };
  });
}
/** Participant view of the published results (null until an organizer publishes). Exposes team names, ranks and scores only. */
export async function publishedResults() {
  const session = await db.r2Session.findUnique({ where: { id: 1 } });
  if (!session?.resultsPublishedAt) return null;
  const { ranked } = await rows();
  return { publishedAt: session.resultsPublishedAt, ranking: ranked.map(r => ({ rank: r.rank, tie: r.tie, name: r.name, partA: r.partA, partB: r.partB, total: r.total })) };
}
