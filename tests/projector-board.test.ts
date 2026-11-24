import { describe, expect, it } from "vitest";
import { selectBoard, TOP } from "../src/lib/game/projector-board";
import type { Scene } from "../src/lib/game/broadcast";

const teams = (n: number, tieFrom = 99) => Array.from({ length: n }, (_, i) => ({ rank: i + 1 >= tieFrom ? tieFrom : i + 1, tied: i + 1 >= tieFrom, id: `T${i + 1}`, name: `Team ${i + 1}`, score: 100 - i, chaptersDone: 3 }));
const input = (scene: Scene, over: Partial<Parameters<typeof selectBoard>[0]> = {}) => ({ scene, standings: null, finalists: null, results: null, ...over });

describe("projector board selection (server-approved data only)", () => {
  it("never shows a ranking while standings are not published, in any scene", () => {
    for (const scene of ["standby", "r1-running", "r1-complete", "intermission", "r2-waiting", "r2-running", "pens-down", "results"] as Scene[]) expect(selectBoard(input(scene)), scene).toBeNull();
  });
  it("standby never shows a ranking, even if data were present", () => { expect(selectBoard(input("standby", { standings: teams(5) }))).toBeNull(); });
  it("Round 1 live: exactly the top twelve, labelled provisional, with the remainder counted", () => {
    const v = selectBoard(input("r1-running", { standings: teams(15) }))!;
    expect(TOP).toBe(12); expect(v.rows).toHaveLength(12); expect(v.extra).toBe(3); expect(v.badge).toBe("LIVE / PROVISIONAL — ROUND 1"); expect(v.max).toBe(105);
    expect(v.rows.map(r => r.name)).toEqual(Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`)); expect(v.rows[0]).toMatchObject({ rank: 1, score: 100 });
  });
  it("fewer than twelve teams: only those teams, nothing invented to fill the board", () => { expect(selectBoard(input("r1-running", { standings: teams(7) }))!.rows).toHaveLength(7); expect(selectBoard(input("r1-running", { standings: [] }))).toBeNull(); });
  it("a tie across the cut keeps the shared rank and says how many tied teams are not listed", () => {
    const v = selectBoard(input("r1-complete", { standings: teams(14, 12) }))!;
    expect(v.rows[11]).toMatchObject({ rank: 12, tied: true }); expect(v.extra).toBe(2); expect(v.extraNote).toBe("2 more teams tied at rank 12"); expect(v.badge).toMatch(/PROVISIONAL/);
    expect(selectBoard(input("r1-complete", { standings: teams(13) }))!.extraNote).toBeNull();
  });
  it("after qualification: only the confirmed finalists (never padded to twelve) when the organizer shows them", () => {
    const names = Array.from({ length: 10 }, (_, i) => `Finalist ${i + 1}`);
    for (const scene of ["intermission", "r2-waiting", "r2-running"] as Scene[]) { const v = selectBoard(input(scene, { finalists: names, standings: teams(30) }))!; expect(v.kind, scene).toBe("finalists"); expect(v.rows, scene).toHaveLength(10); expect(v.rows.every(r => r.score === null && r.rank === null), scene).toBe(true); }
  });
  it("Round 2 never shows invented live scores: Round 1 standings are labelled, finalist-less Round 2 shows the Round 1 board only if approved", () => {
    const v = selectBoard(input("r2-running", { standings: teams(30) }))!; expect(v.kind).toBe("r1"); expect(v.badge).toMatch(/ROUND 2 NOT PUBLISHED/); expect(v.note).toMatch(/not available/);
    expect(selectBoard(input("r2-running"))).toBeNull();
  });
  it("official results appear only in the results scene, from the published rows, with shared ranks", () => {
    const rows = [{ rank: 1, tied: false, name: "A", total: 55 }, { rank: 2, tied: true, name: "B", total: 50 }, { rank: 2, tied: true, name: "C", total: 50 }];
    const v = selectBoard(input("results", { results: rows }))!; expect(v.kind).toBe("results"); expect(v.max).toBe(60); expect(v.rows.map(r => [r.rank, r.tied])).toEqual([[1, false], [2, true], [2, true]]);
    expect(selectBoard(input("pens-down", { results: rows }))).toBeNull(); expect(selectBoard(input("r2-running", { results: rows }))).toBeNull();
  });
});
