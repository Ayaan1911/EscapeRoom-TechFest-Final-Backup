// Round 1 -> Round 2 selection (pure, unit-tested). Input: teams in the saved Round 1 ranking order.
// Exactly TOP_N teams advance. If the cutoff splits teams with EQUAL Round 1 scores, the system does NOT choose between them
// (no team-ID, database-order, alphabetical or timestamp rule): the organizer must pick the remaining places explicitly.
export const TOP_N = 10, STANDBY_N = 2;
export type Cand = { id: string; name: string; total: number; chapter23: number; hintCount: number; completedAt: number | null };
export type TieInfo = { score: number; slots: number; group: Cand[]; sure: Cand[] };
export type Selection = { top10: string[]; standby: string[]; tie: null | { score: number; group: string[]; chosen: string[]; manual: true } };

export class SelectionError extends Error {
  constructor(public code: "tie-unresolved" | "tie-invalid" | "no-teams", message: string) { super(message); }
}

/** The tie straddling the cutoff, or null. `slots` = places still open for the tied group after everyone clearly above it. */
export function cutoffTie(rows: Cand[], n = TOP_N): TieInfo | null {
  if (rows.length <= n) return null;
  const score = rows[n - 1].total;
  if (rows[n].total !== score) return null;
  const group = rows.filter(r => r.total === score), sure = rows.filter(r => r.total > score);
  return { score, slots: n - sure.length, group, sure };
}

/** Pure selection. `chosen` is only accepted when there is a tie, must be a subset of the tied group and have exactly `slots` teams. */
export function selectTop(rows: Cand[], chosen: string[] = [], n = TOP_N, standbyN = STANDBY_N): Selection {
  if (rows.length === 0) throw new SelectionError("no-teams", "No registered teams to qualify");
  const tie = cutoffTie(rows, n), picked = [...new Set(chosen)];
  if (picked.length !== chosen.length) throw new SelectionError("tie-invalid", "A team was selected twice");
  if (!tie) {
    if (picked.length) throw new SelectionError("tie-invalid", "There is no tie at the cutoff, so no manual selection is accepted");
    return { top10: rows.slice(0, n).map(r => r.id), standby: rows.slice(n, n + standbyN).map(r => r.id), tie: null };
  }
  if (picked.length === 0) throw new SelectionError("tie-unresolved", `${tie.group.length} teams are tied on ${tie.score} points for the last ${tie.slots} place${tie.slots === 1 ? "" : "s"}. The organizer must choose; the system will not.`);
  const inGroup = new Set(tie.group.map(r => r.id));
  if (picked.some(id => !inGroup.has(id))) throw new SelectionError("tie-invalid", "Only teams in the tied group can be chosen");
  if (picked.length !== tie.slots) throw new SelectionError("tie-invalid", `Choose exactly ${tie.slots} of the ${tie.group.length} tied teams`);
  const advancing = new Set([...tie.sure.map(r => r.id), ...picked]);
  const top10 = rows.filter(r => advancing.has(r.id)).map(r => r.id);
  return { top10, standby: rows.filter(r => !advancing.has(r.id)).slice(0, standbyN).map(r => r.id), tie: { score: tie.score, group: tie.group.map(r => r.id), chosen: rows.filter(r => picked.includes(r.id)).map(r => r.id), manual: true } };
}
