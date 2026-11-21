import "server-only";
import { db, serializable } from "@/lib/db";
import { csvCell } from "@/lib/csv";
import { audit, clockNow, R2Error, requireAdmin } from "./common.server";
import { INCIDENT_RELEASE_MS, PART_A_MS, ROUND_MS } from "./clock";
import { CONTENT_VERSION, DIFFICULT_TASKS, DIFFICULTY_MAX, partMax, r2Catalog } from "./catalog";
import { explanation } from "./tasks.server";
import { readiness } from "./enrollment.server";
import { rankR2, tieGroups } from "./ranking";
import { createHash } from "node:crypto";
import { POLICY_BEST } from "@/lib/attempts";

/** Start the Round 2 clock. Explicit organizer action only; nothing ever starts automatically. Blocked unless readiness has no blocking failures. */
export async function startRound() {
  await requireAdmin();
  const ready = await readiness();
  if (!ready.ready) throw new R2Error(409, "Round 2 is not ready to start", { checks: ready.checks.filter(c => !c.ok && c.blocking).map(c => c.id) });
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    if (row?.startsAt || row?.endedAt) throw new R2Error(409, "Round 2 was already started");
    const now = new Date();
    await tx.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: now, contentVersion: CONTENT_VERSION, scoringPolicy: POLICY_BEST }, update: { startsAt: now, contentVersion: CONTENT_VERSION, scoringPolicy: POLICY_BEST } }); // the policy is fixed here and never changed afterwards
    const active = await tx.r2Finalist.findMany({ where: { status: "active" }, select: { teamId: true } });
    await audit(tx, "organizer", "start", { startsAt: now.toISOString(), contentVersion: CONTENT_VERSION, scoringPolicy: POLICY_BEST, active: active.map(f => f.teamId) });
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
    // Difficulty subtotal: points earned on the five FROZEN difficult tasks. A tiebreaker only; it is never added to partA/partB/total.
    const difficulty = mine.filter(s => (DIFFICULT_TASKS as readonly string[]).includes(s.taskId)).reduce((n, s) => n + s.earned, 0);
    return { teamId: f.teamId, name: f.team.name, partA: sum("A"), partB: sum("B"), partAMs: start !== null && a.length ? Math.max(...a.map(s => s.lastAwardAt.getTime())) - start : null, difficulty, tasks: r2Catalog.map(t => ({ id: t.id, earned: mine.find(s => s.taskId === t.id)?.earned ?? 0, max: Object.values(t.criteria).reduce((x, y) => x + y, 0) })) };
  };
  return { ranked: rankR2(finalists.filter(f => f.status === "active").map(build)), withdrawn: finalists.filter(f => f.status === "withdrawn").map(build), session };
}
const RULES = "Rank by (1) total score, (2) Part B / Digital Tribunal score, (3) faster Part A completion (server time of the last Part A scoring submission), (4) higher difficulty subtotal on the five frozen difficult tasks (i1.justify, i2.evidence, i3.contradictions, b1.chain, b2.eliminate; max 22; tiebreaker only). Teams equal on all four share the rank; an organizer must acknowledge each exact tie before results can be published.";
/** Fingerprint of an exact-tie group: its rank and each member's four ranking values. An acknowledgment applies to exactly this state. */
const signature = (g: { rank: number; teams: { teamId: string; total: number; partB: number; partAMs: number | null; difficulty: number }[] }) =>
  createHash("sha256").update(JSON.stringify({ rank: g.rank, teams: [...g.teams].sort((x, y) => x.teamId.localeCompare(y.teamId)).map(t => [t.teamId, t.total, t.partB, t.partAMs, t.difficulty]) })).digest("hex");
type Reader = Pick<typeof db, "r2TieAck">;
async function tieStatus(ranked: Awaited<ReturnType<typeof rows>>["ranked"], client: Reader = db) {
  const groups = tieGroups(ranked), acks = await client.r2TieAck.findMany({ where: { signature: { in: groups.map(signature) } } });
  return groups.map(g => { const sig = signature(g), ack = acks.find(a => a.signature === sig); return { rank: g.rank, teamIds: g.teams.map(t => t.teamId), names: g.teams.map(t => t.name), signature: sig, acknowledgment: ack ? { reason: ack.reason, by: ack.decidedBy, at: ack.createdAt } : null }; });
}
/** Final results for organizer review. Only after the round has finished; never visible to teams until published. */
export async function reviewResults() {
  await requireAdmin();
  const { clock } = await clockNow();
  if (clock.phase !== "finished") throw new R2Error(409, "Results can be reviewed after the round has finished");
  const { ranked, withdrawn, session } = await rows(), ties = await tieStatus(ranked);
  return { max: { partA: partMax("A"), partB: partMax("B"), total: partMax("A") + partMax("B"), difficulty: DIFFICULTY_MAX }, difficultTasks: [...DIFFICULT_TASKS], rules: RULES, ranked, withdrawn, ties, unacknowledgedTies: ties.filter(t => !t.acknowledgment).length, tiesNeedAdjudication: ties.length > 0, published: !!session?.resultsPublishedAt, publishedAt: session?.resultsPublishedAt ?? null };
}
export async function resultsCsv() {
  const r = await reviewResults();
  const ackOf = (rank: number) => r.ties.find(t => t.rank === rank)?.acknowledgment;
  const head = ["Rank", "Exact tie (shared rank)", "Tie acknowledgment reason", "Tie acknowledged by", "Tie acknowledged at", "Team ID", "Team", "Part A", "Part B", "Total", "Part A completion ms", `Difficulty subtotal (of ${DIFFICULTY_MAX})`, ...r2Catalog.map(t => t.id)];
  return [head, ...r.ranked.map(x => { const k = x.tie ? ackOf(x.rank) : undefined; return [x.rank, x.tie ? "TIE" : "", k?.reason ?? "", k?.by ?? "", k ? k.at.toISOString() : "", x.teamId, x.name, x.partA, x.partB, x.total, x.partAMs ?? "", x.difficulty, ...x.tasks.map(t => t.earned)]; })].map(row => row.map(csvCell).join(",")).join("\r\n");
}
/**
 * Record that the organizer has seen an EXACT tie (equal on all four ranking criteria) and accepts the shared rank. Append-only; scores, ranks and order are
 * never changed and there is no way to pick a winner. Allowed only after the round has finished and before publication.
 */
export async function acknowledgeTie(input: { rank: number; reason: string }) {
  await requireAdmin();
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 10 || reason.length > 500) throw new R2Error(400, "A reason of 10 to 500 characters is required");
  const { clock, row } = await clockNow();
  if (clock.phase !== "finished") throw new R2Error(409, "Exact ties can be acknowledged only after the round has finished");
  if (row.resultsPublishedAt) throw new R2Error(409, "Results are already published");
  const { ranked } = await rows(), group = tieGroups(ranked).find(g => g.rank === input.rank);
  if (!group) throw new R2Error(409, "There is no exact tie at that rank");
  const sig = signature(group), ids = group.teams.map(t => t.teamId).sort();
  return serializable(async tx => {
    if (await tx.r2TieAck.findUnique({ where: { signature: sig } })) throw new R2Error(409, "This exact tie has already been acknowledged");
    const rec = await tx.r2TieAck.create({ data: { rank: group.rank, teamIds: JSON.stringify(ids), signature: sig, reason, decidedBy: "organizer" } });
    await audit(tx, "organizer", "acknowledge-tie", { rank: group.rank, teamIds: ids, reason, decision: "shared-rank", id: rec.id });
    return { rank: group.rank, teamIds: ids, acknowledgedAt: rec.createdAt };
  });
}
/** The ONLY way results become visible to teams. Explicit, one-way, audited. Blocked while any exact tie is unacknowledged. */
export async function publishResults() {
  await requireAdmin();
  const { ranked } = await rows();
  return serializable(async tx => {
    const { clock, row, now } = await clockNow(tx);
    if (clock.phase !== "finished") throw new R2Error(409, "Results can only be published after the round has finished");
    if (row.resultsPublishedAt) return { publishedAt: row.resultsPublishedAt, already: true };
    const open = (await tieStatus(ranked, tx)).filter(t => !t.acknowledgment);
    if (open.length) throw new R2Error(409, "Exact ties must be acknowledged before results can be published", { unacknowledgedRanks: open.map(t => t.rank) });
    await tx.r2Session.update({ where: { id: 1 }, data: { resultsPublishedAt: new Date(now) } });
    await audit(tx, "organizer", "publish-results", { publishedAt: new Date(now).toISOString(), exactTiesAcknowledged: tieGroups(ranked).length });
    return { publishedAt: new Date(now), already: false };
  });
}
/** Participant view of the published results (null until an organizer publishes). Exposes team names, ranks and scores only. The order comes from rankR2. */
export async function publishedResults() {
  const session = await db.r2Session.findUnique({ where: { id: 1 } });
  if (!session?.resultsPublishedAt) return null;
  const { ranked } = await rows(), ties = await tieStatus(ranked);
  return { publishedAt: session.resultsPublishedAt, rules: RULES, ranking: ranked.map(r => ({ rank: r.rank, tie: r.tie, acknowledged: r.tie && !!ties.find(t => t.rank === r.rank)?.acknowledgment, name: r.name, partA: r.partA, partB: r.partB, total: r.total, difficulty: r.difficulty })) };
}
