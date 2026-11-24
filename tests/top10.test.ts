import { describe, expect, it } from "vitest";
import { cutoffTie, selectTop, SelectionError, type Cand } from "../src/lib/game/top10";

// Ranked list builder: [id, total]. Order = the saved Round 1 ranking.
const rank = (...rows: [string, number][]): Cand[] => rows.map(([id, total]) => ({ id, name: `Team ${id}`, total, chapter23: 0, hintCount: 0, completedAt: null }));
const descending = (n: number, tail?: (i: number) => number) => rank(...Array.from({ length: n }, (_, i): [string, number] => [`T${String(i + 1).padStart(2, "0")}`, tail ? tail(i) : 100 - i]));

describe("Top 10 selection from the saved Round 1 ranking", () => {
  it("takes exactly the first 10 and the next 2 as standby when there is no tie", () => {
    const s = selectTop(descending(14));
    expect(s.top10).toEqual(["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10"]);
    expect(s.standby).toEqual(["T11", "T12"]); expect(s.tie).toBeNull();
  });
  it("advances everyone when there are fewer than 10 teams (nothing is invented)", () => {
    expect(selectTop(descending(7)).top10).toHaveLength(7); expect(selectTop(descending(7)).standby).toEqual([]);
  });
  it("10 teams exactly: all advance, no tie possible", () => { expect(cutoffTie(descending(10))).toBeNull(); expect(selectTop(descending(10)).top10).toHaveLength(10); });
  it("equal scores above or below the cutoff are not a tie at the cutoff", () => {
    expect(cutoffTie(rank(...Array.from({ length: 12 }, (_, i): [string, number] => [`T${i + 1}`, i < 3 ? 90 : 100 - i * 2])))).toBeNull(); // 90,90,90 then distinct
    expect(cutoffTie(descending(14, i => (i >= 11 ? 5 : 100 - i)))).toBeNull(); // tie only at ranks 12-14
  });
  it("a tie across the 10th place is detected with the exact number of open places", () => {
    // 8 clearly ahead; ranks 9-12 share a score: 2 places for 4 teams
    const rows = descending(14, i => (i < 8 ? 100 - i : i < 12 ? 50 : 10 - i));
    const tie = cutoffTie(rows)!;
    expect(tie.score).toBe(50); expect(tie.slots).toBe(2); expect(tie.group.map(r => r.id)).toEqual(["T09", "T10", "T11", "T12"]); expect(tie.sure).toHaveLength(8);
  });
  it("an unresolved tie is refused: the system never picks by order, ID or time", () => {
    const rows = descending(14, i => (i < 8 ? 100 - i : i < 12 ? 50 : 10 - i));
    expect(() => selectTop(rows)).toThrowError(SelectionError);
    try { selectTop(rows); } catch (e) { expect((e as SelectionError).code).toBe("tie-unresolved"); }
  });
  it("an organizer choice must be inside the tied group and exactly the open places", () => {
    const rows = descending(14, i => (i < 8 ? 100 - i : i < 12 ? 50 : 10 - i));
    const code = (ids: string[]) => { try { selectTop(rows, ids); return "ok"; } catch (e) { return (e as SelectionError).code; } };
    expect(code(["T10"])).toBe("tie-invalid"); // too few
    expect(code(["T09", "T10", "T11"])).toBe("tie-invalid"); // too many
    expect(code(["T01", "T10"])).toBe("tie-invalid"); // T01 is not tied
    expect(code(["T13", "T10"])).toBe("tie-invalid"); // below the group
    expect(code(["T10", "T10"])).toBe("tie-invalid"); // duplicate
    expect(code(["T10", "T12"])).toBe("ok");
  });
  it("a valid choice is honoured as given (not alphabetical, not rank order) and recorded as a manual decision", () => {
    const rows = descending(14, i => (i < 8 ? 100 - i : i < 12 ? 50 : 10 - i));
    const s = selectTop(rows, ["T12", "T10"]);
    expect(s.top10).toEqual(["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T10", "T12"]);
    expect(s.top10).not.toContain("T09"); expect(s.top10).not.toContain("T11");
    expect(s.tie).toEqual({ score: 50, group: ["T09", "T10", "T11", "T12"], chosen: ["T10", "T12"], manual: true });
    expect(s.standby).toEqual(["T09", "T11"]); // the tied teams left out follow in ranking order
  });
  it("a manual selection is rejected when there is no tie (it cannot be used to override the ranking)", () => {
    expect(() => selectTop(descending(14), ["T14"])).toThrowError(/no tie/);
  });
  it("no teams, no qualification", () => { expect(() => selectTop([])).toThrowError(SelectionError); });
  it("the whole field tied for 10 places: the organizer chooses all 10", () => {
    const rows = descending(13, () => 40), tie = cutoffTie(rows)!;
    expect(tie.slots).toBe(10); expect(tie.group).toHaveLength(13);
    expect(selectTop(rows, rows.slice(3).map(r => r.id)).top10).toHaveLength(10);
  });
});
