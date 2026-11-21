// Pure projector scoreboard builder: server-calculated standings only. The output type is the COMPLETE public shape of the projector API:
// team name, total saved score, chapters completed. Never access codes, participants, drafts, evidence or Round 2 data.
import { ranking, score, type RankedTeam } from "./engine";

export type BoardRow = { rank: number; tied: boolean; id: string; name: string; score: number; chaptersDone: number };

/** Competition ranking on the saved total: equal totals share a rank (shown as tied); order inside a tie follows the engine's deterministic tiebreakers. */
export function buildBoard(teams: RankedTeam[]): BoardRow[] {
  const ordered = ranking(teams), rows: BoardRow[] = [];
  ordered.forEach((t, i) => {
    const s = score(t.progress), prev = rows[i - 1];
    rows.push({ rank: prev && prev.score === s ? prev.rank : i + 1, tied: false, id: t.id, name: t.name, score: s, chaptersDone: t.progress.chapters.filter(c => c.completedAt !== null).length });
  });
  for (const r of rows) r.tied = rows.filter(x => x.rank === r.rank).length > 1;
  return rows;
}
