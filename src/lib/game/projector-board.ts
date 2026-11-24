// Pure projector board selection (unit-tested, client-safe). It only RE-LABELS what the server already approved for display:
// it never reads the database, never ranks anything itself and never invents rows. A scene with nothing approved returns null
// and the projector shows a status scene instead (no scores leak while standings are unpublished).
import type { Scene } from "./broadcast";

export type BoardRow = { key: string; rank: number | null; tied: boolean; name: string; score: number | null; sub?: string };
export type BoardView = { kind: "r1" | "finalists" | "results"; badge: string; note: string | null; rows: BoardRow[]; extra: number; extraNote: string | null; max: number | null };
type Input = {
  scene: Scene;
  standings: { rank: number; tied: boolean; id: string; name: string; score: number; chaptersDone: number }[] | null;
  finalists: string[] | null;
  results: { rank: number; tied: boolean; name: string; total: number }[] | null;
};
export const TOP = 12;

function cut(rows: BoardRow[]) {
  const shown = rows.slice(0, TOP), rest = rows.slice(TOP), last = shown[shown.length - 1];
  const tiedBeyond = last && last.rank !== null ? rest.filter(r => r.rank === last.rank).length : 0;
  return { rows: shown, extra: rest.length, extraNote: tiedBeyond > 0 ? `${tiedBeyond} more team${tiedBeyond === 1 ? "" : "s"} tied at rank ${last.rank}` : null };
}

export function selectBoard(p: Input): BoardView | null {
  const r1 = (badge: string, note: string | null): BoardView | null => p.standings && p.standings.length ? {
    kind: "r1", badge, note, max: 105, ...cut(p.standings.map(t => ({ key: t.id, rank: t.rank, tied: t.tied, name: t.name, score: t.score, sub: `${t.chaptersDone}/5 chapters` }))),
  } : null;
  switch (p.scene) {
    case "r1-running": return r1("LIVE / PROVISIONAL — ROUND 1", "Standings update as teams save progress.");
    case "r1-complete": return r1("ROUND 1 CLOSED · PROVISIONAL", "Under organizer review. Not final.");
    case "intermission":
    case "r2-waiting":
    case "r2-running":
    case "pens-down": {
      if (p.finalists && p.finalists.length) return { kind: "finalists", badge: "ROUND 2 FINALISTS · QUALIFIED", note: p.scene === "r2-running" || p.scene === "pens-down" ? "Round 2 scores are not published yet." : p.scene === "r2-waiting" ? "Round 2 starts when the organizers press start." : "Confirmed by the organizers.", rows: p.finalists.map(n => ({ key: n, rank: null, tied: false, name: n, score: null })), extra: 0, extraNote: null, max: null };
      return r1(p.scene === "r2-running" || p.scene === "pens-down" ? "ROUND 1 STANDINGS · ROUND 2 NOT PUBLISHED" : "ROUND 1 STANDINGS · QUALIFICATION CONFIRMED", p.scene === "r2-running" || p.scene === "pens-down" ? "Round 2 scores are not available yet." : null);
    }
    case "results": return p.results && p.results.length ? { kind: "results", badge: "ROUND 2 · OFFICIAL RESULTS", note: "Published by the organizers.", max: 60, ...cut(p.results.map(r => ({ key: r.name, rank: r.rank, tied: r.tied, name: r.name, score: r.total }))) } : null;
    default: return null; // standby: never any ranking
  }
}
