// FINAL Round 2 ranking (organizer-approved). Criteria in EXACTLY this order:
//   1. higher total score (of 100)
//   2. higher Part B / Digital Tribunal score
//   3. faster Part A completion time = ms from the server-recorded round start to the LAST Part A submission that earned new points
//      (server timestamp; teams with no Part A points are slowest; client times are never used)
//   4. higher difficulty subtotal = points earned on the five frozen difficult tasks (DIFFICULT_TASKS, max 22). TIEBREAKER ONLY: never added to a score.
//   5. equal on all four: the teams SHARE the rank and are flagged `tie`; the organizer must acknowledge each such group before results can be published.
// Display order inside a shared rank falls back to team id for stability only; it carries no meaning.
// This is the ONLY place results are sorted: organizer results, published results and the CSV all use it.
export type R2Row = { teamId: string; partA: number; partB: number; partAMs: number | null; difficulty: number };
export type Ranked<T extends R2Row> = T & { total: number; rank: number; tie: boolean };
const timeKey = (r: R2Row) => r.partAMs ?? Infinity;
type K = R2Row & { total: number };
export const compareR2 = (a: K, b: K) => b.total - a.total || b.partB - a.partB || Math.sign(timeKey(a) === timeKey(b) ? 0 : timeKey(a) < timeKey(b) ? -1 : 1) || b.difficulty - a.difficulty; // not a subtraction for time: Infinity - Infinity is NaN
export function rankR2<T extends R2Row>(rows: T[]): Ranked<T>[] {
  const sorted = rows.map(r => ({ ...r, total: r.partA + r.partB })).sort((a, b) => compareR2(a, b) || a.teamId.localeCompare(b.teamId));
  return sorted.map(row => ({ ...row, rank: sorted.findIndex(o => compareR2(o, row) === 0) + 1, tie: sorted.filter(o => compareR2(o, row) === 0).length > 1 }));
}
/** Groups of teams that are exactly equal on all four criteria (one group per shared rank). */
export function tieGroups<T extends R2Row>(ranked: Ranked<T>[]) {
  const by = new Map<number, Ranked<T>[]>();
  for (const r of ranked) if (r.tie) by.set(r.rank, [...(by.get(r.rank) ?? []), r]);
  return [...by.entries()].map(([rank, teams]) => ({ rank, teams }));
}
