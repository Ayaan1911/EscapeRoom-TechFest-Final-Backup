import { expect, it } from "vitest";
import { initialProgress, complete, bonus, useHint as consumeHint, current, score, ranking, type Progress } from "../src/lib/game/engine";
import { resultTotals, qualificationRows } from "../src/lib/game/results";

function team(id: string, scores = [15, 25, 25, 20, 15], completedAt: number | null = 1000) { const progress = initialProgress(); progress.chapters.forEach((chapter, i) => { chapter.score = scores[i]; chapter.completedAt = completedAt; }); progress.completedAt = completedAt; return { id, name: id, progress }; }
it("preserves exactly the original five tie-breaks, ranks incomplete teams and never sorts the input in place", () => {
  const higher = team("HIGH", [15, 25, 25, 20, 15], null), lower = team("LOW", [0, 0, 0, 0, 0]); expect(qualificationRows([lower, higher])[0].id).toBe("HIGH");
  const a = team("A", [15, 11, 0, 0, 0]), b = team("B", [10, 10, 6, 0, 0]); expect(score(a.progress)).toBe(score(b.progress)); expect(qualificationRows([a, b])[0].id).toBe("B");
  const fewer = team("FEWER"), more = team("MORE"); fewer.progress.chapters[0].hints = 2; for (const i of [0, 1, 2]) more.progress.chapters[i].hints = 1; expect(score(fewer.progress)).toBe(score(more.progress)); expect(qualificationRows([more, fewer])[0].id).toBe("FEWER");
  const early = team("Z-EARLY", undefined, 0), late = team("A-LATE", undefined, 1000), incomplete = team("INCOMPLETE", undefined, null); expect(qualificationRows([incomplete, late, early]).map(row => row.id)).toEqual(["Z-EARLY", "A-LATE", "INCOMPLETE"]);
  const z = team("Z"), first = team("A"), list = [z, first], before = JSON.stringify(list); expect(qualificationRows(list).map(row => row.id)).toEqual(["A", "Z"]); expect(JSON.stringify(list)).toBe(before); expect(qualificationRows(list).map(row => row.id)).toEqual(ranking(list).map(row => row.id));
});
it("creates only real top-ten and standby candidates for zero, small and larger rosters", () => {
  for (const count of [0, 1, 9, 10, 11, 12, 15]) { const rows = qualificationRows(Array.from({ length: count }, (_, i) => team(`TEAM-${String(i).padStart(2, "0")}`))); expect(rows).toHaveLength(count); expect(rows.filter(row => row.selection === "Top 10 candidate")).toHaveLength(Math.min(10, count)); expect(rows.filter(row => row.selection === "Standby candidate")).toHaveLength(Math.min(2, Math.max(0, count - 10))); expect(rows.every(row => row.rank >= 1 && row.rank <= count)).toBe(true); }
});
it("reports the existing deductions accurately for all 243 hint combinations and either global bonus state", () => {
  for (let pattern = 0; pattern < 243; pattern++) for (const earned of [false, true]) { const p = team("A").progress; p.bonus = earned ? 5 : 0; p.chapters.forEach((chapter, i) => { chapter.hints = Math.floor(pattern / 3 ** i) % 3; }); const totals = resultTotals(p); expect(totals.total).toBe(score(p)); expect(totals.total).toBe(100 + totals.bonus - totals.totalDeduction); expect(totals.total).toBeLessThanOrEqual(105); }
});
it("closes all five chapters at exactly 105 maximum, persists the trusted time and rejects replay or extra bonus", () => {
  for (const count of [0, 1, 2]) { const p: Progress = initialProgress(); for (const [i, points] of [15, 25, 25, 20].entries()) complete(p, i, points, 1); bonus(p); for (let i = 0; i < count; i++) consumeHint(p, 4); complete(p, 4, 15, 1234); expect(current(p)).toBe(-1); expect(p.completedAt).toBe(1234); expect(score(p)).toBe(105 - [0, 3, 9][count]); expect(() => complete(p, 4, 15, 9999)).toThrow(); expect(p.completedAt).toBe(1234); expect(() => bonus(p)).toThrow(); }
});
