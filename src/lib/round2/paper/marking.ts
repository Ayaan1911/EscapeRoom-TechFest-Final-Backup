// Pure Round 2 result arithmetic (unit-tested). Total = Inject 1 + terminal + Inject 3 + Inject 4, only when all four are known and the
// terminal score is final (round over). Equal totals share a rank: no tie-breaker is approved for the 60-minute format (owner decision).
export type MarkCell = { score: number; marker: string; at: string } | null;
export type TerminalCell = { score: number | null; final: boolean; untouched: boolean; attempts: number; contained: number; lockReason: string };
export type ResultInput = { teamId: string; name: string; seed: number; i1: MarkCell; i3: MarkCell; i4: MarkCell; terminal: TerminalCell };
export type ResultRow = ResultInput & { total: number | null; pending: string[]; rank: number | null; tied: boolean };

export function pendingParts(r: ResultInput): string[] {
  const out: string[] = [];
  if (!r.i1) out.push("Inject 1");
  if (r.terminal.score === null) out.push("Kill Switch (key missing)"); else if (!r.terminal.final) out.push("Kill Switch (round running)");
  if (!r.i3) out.push("Inject 3");
  if (!r.i4) out.push("Inject 4");
  return out;
}

export function rankResults(rows: ResultInput[]): ResultRow[] {
  const withTotals = rows.map(r => { const pending = pendingParts(r);
    return { ...r, pending, total: pending.length ? null : r.i1!.score + r.terminal.score! + r.i3!.score + r.i4!.score, rank: null as number | null, tied: false }; });
  const done = withTotals.filter(r => r.total !== null).sort((a, b) => b.total! - a.total! || a.seed - b.seed);
  done.forEach((r, i) => { r.rank = i > 0 && done[i - 1].total === r.total ? done[i - 1].rank : i + 1; });
  for (const r of done) r.tied = done.filter(x => x.rank === r.rank).length > 1;
  const pending = withTotals.filter(r => r.total === null).sort((a, b) => a.seed - b.seed);
  return [...done, ...pending];
}
