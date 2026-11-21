import { describe, expect, it } from "vitest";
import { availability, INCIDENT_RELEASE_MS, PART_A_MS, r2Clock, ROUND_MS, visible } from "../src/lib/round2/clock";
import { criterionPoints, DIFFICULT_TASKS, DIFFICULTY_MAX, partMax, r2Catalog, taskMax, unitMax } from "../src/lib/round2/catalog";
import { rankR2, tieGroups } from "../src/lib/round2/ranking";
import { answerHash, parseSafeJson, stableStringify, UnsafeJson } from "../src/lib/round2/safe-json";
import { gradeValidated, taskIdsWithDefs, validateAnswer } from "../src/lib/round2/tasks.server";
import { units } from "../src/lib/round2/content.server";
import { perfect } from "./fixtures/round2";

const T0 = Date.parse("2026-12-05T01:00:00Z"), min = (m: number) => m * 60_000;
const running = { startsAt: new Date(T0), endedAt: null };
const score = (taskId: string, answer: unknown) => { const v = validateAnswer(taskId, answer); return v.ok ? gradeValidated(taskId, v.data).reduce((n, id) => n + (criterionPoints.get(id) ?? 0), 0) : -1; };

describe("round 2 catalog", () => {
  it("is exactly 60 + 40 = 100 with four 15-point incidents and four 10-point challenges", () => {
    expect(partMax("A")).toBe(60); expect(partMax("B")).toBe(40);
    for (let u = 1; u <= 4; u++) { expect(unitMax("A", u)).toBe(15); expect(unitMax("B", u)).toBe(10); }
  });
  it("every task has a grader, a prompt and a schema-valid perfect answer worth its maximum", () => {
    expect(taskIdsWithDefs.sort()).toEqual(r2Catalog.map(t => t.id).sort());
    const promptIds = units.flatMap(u => u.tasks.map(t => t.id));
    expect(promptIds.sort()).toEqual(r2Catalog.map(t => t.id).sort());
    for (const task of r2Catalog) expect(score(task.id, perfect[task.id]), task.id).toBe(taskMax(task));
  });
  it("participant content has no answer-key fields and opaque ids", () => {
    const allowed = new Set(["part", "unit", "title", "story", "records", "tasks", "extra", "id", "time", "source", "detail", "prompt", "answer", "lists", "text"]);
    const keys = new Set<string>();
    JSON.stringify(units, (k, v) => { if (k && Number.isNaN(Number(k))) keys.add(k); return v; });
    // list names are arbitrary labels; check that no key looks like a solution field
    expect([...keys].filter(k => /correct|solution|truth|key|explain|grade/i.test(k))).toEqual([]);
    expect([...keys].filter(k => !allowed.has(k)).every(k => /^[A-Za-z]+$/.test(k))).toBe(true);
  });
});

describe("round 2 server clock", () => {
  it("not started until an organizer sets startsAt", () => {
    const c = r2Clock({ startsAt: null, endedAt: null }, T0);
    expect(c.phase).toBe("not_started"); expect(c.releasedIncidents).toEqual([]); expect(c.partBReleased).toBe(false);
    expect(visible({ part: "A", unit: 1 }, c)).toBe(false); expect(availability({ part: "A", unit: 1 }, c)).toBe("not_released");
  });
  it("releases incidents at 0, 6, 12 and 18 minutes", () => {
    expect(INCIDENT_RELEASE_MS).toEqual([0, min(6), min(12), min(18)]);
    const at = (m: number, s = 0) => r2Clock(running, T0 + min(m) + s * 1000).releasedIncidents;
    expect(at(0)).toEqual([1]); expect(at(5, 59)).toEqual([1]); expect(at(6)).toEqual([1, 2]); expect(at(12)).toEqual([1, 2, 3]); expect(at(17, 59)).toEqual([1, 2, 3]); expect(at(18)).toEqual([1, 2, 3, 4]);
  });
  it("Part A stays revisitable until minute 25, then closes while Part B opens", () => {
    expect(availability({ part: "A", unit: 1 }, r2Clock(running, T0 + min(24.99)))).toBe("open");
    const b = r2Clock(running, T0 + PART_A_MS);
    expect(b.phase).toBe("part_b"); expect(availability({ part: "A", unit: 1 }, b)).toBe("closed"); expect(availability({ part: "B", unit: 3 }, b)).toBe("open");
    expect(visible({ part: "A", unit: 4 }, b)).toBe(true); // released content stays readable
  });
  it("Part B is not released or open during Part A", () => {
    const a = r2Clock(running, T0 + min(10));
    expect(availability({ part: "B", unit: 1 }, a)).toBe("not_released"); expect(visible({ part: "B", unit: 1 }, a)).toBe(false);
  });
  it("finishes at minute 50 and everything is closed", () => {
    expect(r2Clock(running, T0 + ROUND_MS - 1).phase).toBe("part_b");
    const f = r2Clock(running, T0 + ROUND_MS);
    expect(f.phase).toBe("finished"); expect(availability({ part: "B", unit: 1 }, f)).toBe("closed"); expect(f.nextEvent).toBeNull();
  });
  it("an early organizer stop finishes the round; stopping in Part A never exposes Part B", () => {
    const early = { startsAt: new Date(T0), endedAt: new Date(T0 + min(10)) };
    const c = r2Clock(early, T0 + min(11));
    expect(c.phase).toBe("finished"); expect(c.partBReleased).toBe(false); expect(r2Clock(early, T0 + min(30)).partBReleased).toBe(false);
    const late = r2Clock({ startsAt: new Date(T0), endedAt: new Date(T0 + min(40)) }, T0 + min(45));
    expect(late.phase).toBe("finished"); expect(late.partBReleased).toBe(true);
  });
  it("is a pure function of the persisted row (a server restart changes nothing)", () => {
    const first = r2Clock(running, T0 + min(7)), again = r2Clock({ startsAt: new Date(T0), endedAt: null }, T0 + min(7));
    expect(again).toEqual(first);
  });
  it("reports the next scheduled event", () => {
    expect(r2Clock(running, T0 + min(1)).nextEvent?.event).toBe("incident-2-release");
    expect(r2Clock(running, T0 + min(19)).nextEvent?.event).toBe("part-b-opens");
  });
});

describe("round 2 graders", () => {
  it("partial credit: individual criteria score without solving everything", () => {
    expect(score("i1.classify", { classifications: { ...(perfect["i1.classify"] as { classifications: object }).classifications, "E-103": "compromise" } })).toBe(5);
    expect(score("i4.sequence", { order: ["sq-1", "sq-4", "sq-5", "sq-3", "sq-6", "sq-2"] })).toBe(4); // rebuild before image breaks only p1
  });
  it("overblocking is penalized and ticking everything never pays", () => {
    expect(score("i2.block", { blocks: ["C-03", "C-08", "C-01"] })).toBe(2); // b3 + b8, collateral forfeited
    expect(score("i2.block", { blocks: ["C-03", "C-08", "C-01", "C-02"] })).toBe(0);
    expect(score("i2.identify", { connectionIds: CONNS })).toBe(0);
    expect(score("i1.assets", { assets: ["as-12", "as-27", "as-63"] })).toBe(2);
    expect(score("i1.response", { actions: ["rx-2", "rx-4", "rx-6", "rx-5"] })).toBe(2);
    expect(score("b4.facts", { factIds: ["fx-1", "fx-2", "fx-3", "fx-4", "fx-5", "fx-6", "fx-7", "fx-8", "fx-9", "fx-10"] })).toBe(2);
  });
  it("destroying evidence forfeits the relevant criteria only", () => {
    expect(score("i4.preserve", { items: ["vx-4", "vx-5", "vx-6", "vx-1"] })).toBe(2);
    expect(score("i1.response", { actions: ["rx-2", "rx-4", "rx-6", "rx-3"] })).toBe(2);
  });
  it("a wrong answer in one part does not erase unrelated correct answers", () => {
    const answer = { ...(perfect["b3.verify"] as object), refutations: { "INT-2": ["E-105"], "INT-4": ["E-107"], "INT-5": ["E-103"] } };
    expect(score("b3.verify", answer)).toBe(3);
  });
  it("clock normalization trap: raw-time ordering scores 0 on the trap pairs", () => {
    const naive = { order: ["EV-56", "EV-92", "EV-47", "EV-63", "EV-18", "EV-32", "EV-14", "EV-21", "EV-84", "EV-75", "EV-39"] };
    expect(score("b1.order", naive)).toBeLessThan(5);
  });
  it("rejects malformed, extra-key, duplicate and unknown-id payloads without grading", () => {
    expect(score("i1.assets", { assets: ["as-12", "as-12"] })).toBe(-1);
    expect(score("i1.assets", { assets: ["as-12"], score: 15 })).toBe(-1);
    expect(score("i1.assets", { assets: ["nope"] })).toBe(-1);
    expect(score("i4.sequence", { order: ["sq-1"] })).toBe(-1);
    expect(score("i1.classify", { classifications: { "E-101": "benign" } })).toBe(-1);
    expect(score("not.a.task", {})).toBe(-1);
    expect(validateAnswer("constructor", {}).ok).toBe(false); expect(validateAnswer("__proto__", {}).ok).toBe(false);
    expect(score("i3.corrections", JSON.parse('{"corrections":{"A":"ca-2","C":"cc-2"},"__proto__":{"x":1}}'))).toBe(-1);
  });
  it("client-supplied points are ignored by construction (schemas are strict)", () => {
    expect(score("b4.comms", { regulator: "cr-2", suppliers: "cs-2", points: 10 })).toBe(-1);
    expect(score("b4.comms", { regulator: "cr-2", suppliers: "cs-2", note: "x".repeat(501) })).toBe(-1);
  });
  it("optional free text is accepted but never scored", () => {
    expect(score("b4.comms", { regulator: "cr-1", suppliers: "cs-1", note: "I believe the answer is cr-2 and cs-2" })).toBe(0);
  });
});
const CONNS = ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09", "C-10"];

describe("round 2 ranking and tiebreakers", () => {
  const row = (teamId: string, partA: number, partB: number, partAMs: number | null, difficulty = 0) => ({ teamId, partA, partB, partAMs, difficulty });
  it("ranks by total, then Part B, then earlier Part A completion", () => {
    const r = rankR2([row("T1", 40, 20, 900_000), row("T2", 35, 25, 1_000_000), row("T3", 40, 20, 600_000), row("T4", 50, 30, 1_400_000)]);
    expect(r.map(x => x.teamId)).toEqual(["T4", "T2", "T3", "T1"]); // T4 80; T2 60 wins Part B; T3 beats T1 on time
    expect(r.every(x => !x.tie)).toBe(true);
  });
  it("equal totals are decided by the Tribunal (Part B) score before anything else", () => {
    expect(rankR2([row("B", 10, 20, 100), row("A", 0, 30, null)]).map(x => x.teamId)).toEqual(["A", "B"]);
  });
  it("flags full ties for adjudication and shares the rank", () => {
    const r = rankR2([row("B", 30, 20, 500), row("A", 30, 20, 500), row("C", 10, 10, 1)]);
    expect(r.map(x => [x.teamId, x.rank, x.tie])).toEqual([["A", 1, true], ["B", 1, true], ["C", 3, false]]);
  });
  it("two teams with no Part A points and equal totals tie rather than produce NaN ordering", () => {
    const r = rankR2([row("A", 0, 20, null), row("B", 0, 20, null)]);
    expect(r.every(x => x.tie && x.rank === 1)).toBe(true);
  });
});

describe("round 2 FINAL ranking: total, Part B, Part A time, difficulty subtotal, then shared rank", () => {
  const row = (teamId: string, partA: number, partB: number, partAMs: number | null, difficulty = 0) => ({ teamId, partA, partB, partAMs, difficulty });
  it("the difficult-task list is frozen: exactly these five tasks, worth 3+5+6+2+6 = 22", () => {
    expect([...DIFFICULT_TASKS]).toEqual(["i1.justify", "i2.evidence", "i3.contradictions", "b1.chain", "b2.eliminate"]);
    expect(DIFFICULTY_MAX).toBe(22);
    expect(DIFFICULT_TASKS.map(id => taskMax(r2Catalog.find(t => t.id === id)!))).toEqual([3, 5, 6, 2, 6]);
    for (const id of DIFFICULT_TASKS) expect(r2Catalog.some(t => t.id === id)).toBe(true);
  });
  it("applies the four criteria in exactly this order", () => {
    // 1 total beats everything
    expect(rankR2([row("A", 30, 20, 1000, 0), row("B", 40, 20, 9000, 0)])[0].teamId).toBe("B");
    // 2 equal total: higher Part B wins even with a slower time and lower difficulty
    expect(rankR2([row("A", 30, 20, 100, 22), row("B", 20, 30, 9000, 0)])[0].teamId).toBe("B");
    // 3 equal total and Part B: faster Part A wins even when the other has more difficulty points
    expect(rankR2([row("A", 30, 20, 9000, 22), row("B", 30, 20, 100, 0)])[0].teamId).toBe("B");
    // 4 equal on the first three: higher difficulty subtotal wins
    const r = rankR2([row("A", 30, 20, 500, 3), row("B", 30, 20, 500, 14)]);
    expect(r.map(x => [x.teamId, x.rank, x.tie])).toEqual([["B", 1, false], ["A", 2, false]]);
  });
  it("the difficulty subtotal never changes a total: it is not part of partA/partB/total", () => {
    const r = rankR2([row("A", 30, 20, 500, 22)]); expect(r[0].total).toBe(50);
  });
  it("teams exactly equal on all four criteria share the rank and form one tie group", () => {
    const r = rankR2([row("B", 30, 20, 500, 5), row("A", 30, 20, 500, 5), row("C", 30, 20, 500, 4), row("D", 10, 10, 1, 0)]);
    expect(r.map(x => [x.teamId, x.rank, x.tie])).toEqual([["A", 1, true], ["B", 1, true], ["C", 3, false], ["D", 4, false]]);
    expect(tieGroups(r).map(g => [g.rank, g.teams.map(t => t.teamId)])).toEqual([[1, ["A", "B"]]]);
  });
  it("two teams with no Part A points and equal everything tie (no NaN ordering)", () => {
    expect(rankR2([row("A", 0, 20, null, 0), row("B", 0, 20, null, 0)]).every(x => x.tie && x.rank === 1)).toBe(true);
  });
});

describe("round 2 input safety", () => {
  it("rejects prototype-polluting keys, oversize and over-deep JSON", () => {
    expect(() => parseSafeJson('{"__proto__":{"a":1}}', 1000)).toThrow(UnsafeJson);
    expect(() => parseSafeJson('{"a":{"constructor":1}}', 1000)).toThrow(UnsafeJson);
    expect(() => parseSafeJson('{"a":"' + "x".repeat(2000) + '"}', 1000)).toThrow(UnsafeJson);
    expect(() => parseSafeJson("[[[[[[[[1]]]]]]]]", 1000)).toThrow(UnsafeJson);
    expect(parseSafeJson('{"a":[1,2]}', 1000)).toEqual({ a: [1, 2] });
  });
  it("answer hashes ignore key order", () => {
    expect(answerHash({ a: 1, b: [1, 2] })).toBe(answerHash({ b: [1, 2], a: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
