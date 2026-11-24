import { describe, expect, it } from "vitest";
import { pendingParts, rankResults, type ResultInput } from "../src/lib/round2/paper/marking";
import { eventStages, type StageInput } from "../src/lib/game/stages";
import { sceneOf } from "../src/lib/game/broadcast";

const mark = (score: number) => ({ score, marker: "J", at: "2026-01-01T00:00:00Z" });
const team = (id: string, seed: number, i1: number | null, term: number | null, i3: number | null, i4: number | null, final = true): ResultInput =>
  ({ teamId: id, name: id, seed, i1: i1 === null ? null : mark(i1), i3: i3 === null ? null : mark(i3), i4: i4 === null ? null : mark(i4), terminal: { score: term, final, untouched: false, attempts: 2, contained: 2, lockReason: "contained" } });

describe("Round 2 results: four parts, pending never zero, no double counting", () => {
  it("totals only complete teams, once each part (terminal counted exactly once)", () => {
    const [a] = rankResults([team("A", 1, 10, 15, 12, 9)]);
    expect(a.total).toBe(46); expect(a.pending).toEqual([]); expect(a.rank).toBe(1);
  });
  it("a missing mark keeps the team pending with no total and no rank", () => {
    const [a] = rankResults([team("A", 1, 10, 15, null, 9)]);
    expect(a.total).toBeNull(); expect(a.rank).toBeNull(); expect(a.pending).toEqual(["Inject 3"]);
  });
  it("a zero mark is a real mark, unlike a missing one", () => {
    expect(rankResults([team("A", 1, 0, 0, 0, 0)])[0].total).toBe(0);
  });
  it("the terminal score is not final while the round runs, and missing without the key", () => {
    expect(pendingParts(team("A", 1, 1, 5, 1, 1, false))).toEqual(["Kill Switch (round running)"]);
    expect(pendingParts(team("A", 1, 1, null, 1, 1))).toEqual(["Kill Switch (key missing)"]);
  });
  it("equal totals share a rank (no invented tie-break); pending teams follow, unranked", () => {
    const rows = rankResults([team("C", 3, 10, 10, 10, 10), team("A", 1, 15, 15, 15, 15), team("B", 2, 10, 10, 10, 10), team("D", 4, null, 10, 10, 10)]);
    expect(rows.map(r => [r.teamId, r.rank, r.tied])).toEqual([["A", 1, false], ["B", 2, true], ["C", 2, true], ["D", null, false]]);
  });
});

const base: StageInput = { teams: 40, r1: "waiting", qualified: false, enrolled: 0, r2: "not_started", r2Retired: false, marked: 0, finalists: 0, published: false };
const states = (s: Partial<StageInput>) => eventStages({ ...base, ...s }).map(x => x.state);
describe("event pipeline reflects server state, never assumes completion", () => {
  it("seven stages, preparation active before the start", () => {
    expect(states({})).toEqual(["active", "pending", "pending", "pending", "pending", "pending", "pending"]);
    expect(states({ teams: 0 })[0]).toBe("blocked");
  });
  it("walks through the event", () => {
    expect(states({ r1: "active" })).toEqual(["done", "active", "pending", "pending", "pending", "pending", "pending"]);
    expect(states({ r1: "finished" }).slice(1, 4)).toEqual(["done", "active", "pending"]);
    expect(states({ r1: "finished", qualified: true }).slice(2, 4)).toEqual(["done", "active"]);
    expect(states({ r1: "finished", qualified: true, enrolled: 10, r2: "running" }).slice(3, 6)).toEqual(["done", "active", "pending"]);
    expect(states({ r1: "finished", qualified: true, enrolled: 10, r2: "complete", marked: 4, finalists: 10 }).slice(4)).toEqual(["done", "active", "pending"]);
    expect(states({ r1: "finished", qualified: true, enrolled: 10, r2: "complete", marked: 10, finalists: 10, published: true })).toEqual(Array(7).fill("done"));
  });
  it("enrolled finalists never make Round 2 'ready' without a confirmed qualification", () => {
    expect(states({ r1: "active", enrolled: 10 }).slice(1, 4)).toEqual(["active", "pending", "pending"]);
  });
  it("a retired Round 2 session blocks the Round 2 stage instead of showing it as run", () => {
    expect(states({ r1: "finished", qualified: true, enrolled: 10, r2: "complete", r2Retired: true }).slice(3, 6)).toEqual(["blocked", "pending", "pending"]);
  });
});

describe("projector scene comes only from server state", () => {
  const s = (x: Partial<Parameters<typeof sceneOf>[0]>) => sceneOf({ r1: "waiting", qualified: false, enrolled: 0, r2: "not_started", published: false, ...x });
  it("maps every stage", () => {
    expect(s({})).toBe("standby");
    expect(s({ r1: "active" })).toBe("r1-running");
    expect(s({ r1: "finished" })).toBe("r1-complete");
    expect(s({ r1: "finished", qualified: true })).toBe("intermission");
    expect(s({ r1: "finished", qualified: true, enrolled: 10 })).toBe("r2-waiting");
    expect(s({ r1: "finished", qualified: true, enrolled: 10, r2: "running" })).toBe("r2-running");
    expect(s({ r2: "complete" })).toBe("pens-down");
    expect(s({ r2: "complete", published: true })).toBe("results");
  });
  it("never shows results before publication", () => { expect(s({ r2: "complete", published: false })).not.toBe("results"); });
});
