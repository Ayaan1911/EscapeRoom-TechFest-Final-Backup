// Round 2 ranking. Keys, in order: total (desc), Part B / Digital Tribunal (desc), Part A completion time (asc), then a flagged tie.
// Part A completion time = milliseconds from the server-recorded round start to the LAST Part A submission that earned new points
// (server timestamp of that submission). Teams with no Part A points sort last on this key. Never uses client-provided times.
// Teams equal on all three keys share a rank and are flagged `tie` for organizer adjudication; display order falls back to team id only for stability.
export type R2Row = { teamId: string; partA: number; partB: number; partAMs: number | null };
export type Ranked<T extends R2Row> = T & { total: number; rank: number; tie: boolean };
const timeKey = (r: R2Row) => r.partAMs ?? Infinity;
export function rankR2<T extends R2Row>(rows: T[]): Ranked<T>[] {
  const withTotal = rows.map(r => ({ ...r, total: r.partA + r.partB }));
  const cmp = (a: R2Row & { total: number }, b: R2Row & { total: number }) => b.total - a.total || b.partB - a.partB || Math.sign(timeKey(a) === timeKey(b) ? 0 : timeKey(a) < timeKey(b) ? -1 : 1); // not a subtraction: Infinity - Infinity is NaN
  const sorted = [...withTotal].sort((a, b) => cmp(a, b) || a.teamId.localeCompare(b.teamId));
  return sorted.map(row => ({ ...row, rank: sorted.findIndex(o => cmp(o, row) === 0) + 1, tie: sorted.filter(o => cmp(o, row) === 0).length > 1 }));
}
