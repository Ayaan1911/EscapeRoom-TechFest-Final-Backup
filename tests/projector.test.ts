import { describe, expect, it } from "vitest";
import { initialProgress } from "../src/lib/game/engine";
import { buildBoard } from "../src/lib/game/projector";

const team = (id: string, raw: number[], done: number[] = []) => { const p = initialProgress(); raw.forEach((n, i) => { p.chapters[i].score = n; }); done.forEach(i => { p.chapters[i].completedAt = 1; }); return { id, name: `Team ${id}`, progress: p }; };
describe("projector board (server-calculated standings, minimal shape)", () => {
  it("ranks by saved total and gives equal totals the same rank, marked tied", () => {
    const rows = buildBoard([team("B", [10]), team("A", [15, 10]), team("C", [10]), team("D", [1])]);
    expect(rows.map(r => [r.id, r.rank, r.tied])).toEqual([["A", 1, false], ["B", 2, true], ["C", 2, true], ["D", 4, false]]);
  });
  it("uses the same total as the game (hints deducted)", () => { const t = team("H", [15]); t.progress.chapters[0].hints = 1; expect(buildBoard([t])[0].score).toBe(12); });
  it("exposes only id, name, rank, tie flag, total and chapters done: no codes, participants or progress detail", () => {
    const [row] = buildBoard([{ ...team("X", [5], [0]), codeHash: "secret", participants: "[\"a\"]" } as never]);
    expect(Object.keys(row).sort()).toEqual(["chaptersDone", "id", "name", "rank", "score", "tied"]);
    expect(JSON.stringify(row)).not.toMatch(/secret|participants|codeHash/);
    expect(row.chaptersDone).toBe(1);
  });
  it("handles an empty event", () => { expect(buildBoard([])).toEqual([]); });
});
