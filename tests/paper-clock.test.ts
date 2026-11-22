import { describe, expect, it } from "vitest";
import { CHAPTERS, INVESTIGATION_MS, paperClock, schedule } from "../src/lib/round2/paper/clock";

const T0 = Date.parse("2026-11-23T09:00:00Z");
const at = (min: number, sec = 0) => T0 + min * 60_000 + sec * 1000;
const session = { startsAt: new Date(T0), endedAt: null as Date | null };
const chapterAt = (ms: number) => { const c = paperClock(session, ms); return c.phase === "running" ? c.chapter : c.phase; };

describe("paper clock: four chapters in a 40-minute investigation", () => {
  it("has the approved windows", () => { expect(CHAPTERS.map(c => [c.fromMin, c.toMin])).toEqual([[0, 8], [8, 20], [20, 30], [30, 40]]); expect(INVESTIGATION_MS).toBe(40 * 60_000); });
  it("is not started before the start instant or without a session", () => {
    expect(paperClock({ startsAt: null, endedAt: null }, at(5))).toEqual({ phase: "not_started" });
    expect(chapterAt(T0 - 1)).toBe("not_started");
  });
  it.each([
    [0, 0, 1], [7, 59, 1], [8, 0, 2], [19, 59, 2], [20, 0, 3], [29, 59, 3], [30, 0, 4], [39, 59, 4],
  ])("minute %i second %i is chapter %i", (m, s, ch) => { expect(chapterAt(at(m, s))).toBe(ch); });
  it("is complete at 40:00 and stays complete", () => { expect(chapterAt(at(40))).toBe("complete"); expect(chapterAt(at(400))).toBe("complete"); });
  it("never reopens an earlier chapter as time advances (monotonic)", () => {
    let last = 0; for (let s = 0; s <= 41 * 60; s += 7) { const c = paperClock(session, T0 + s * 1000); const n = c.phase === "running" ? c.chapter : c.phase === "complete" ? 5 : 0; expect(n).toBeGreaterThanOrEqual(last); last = n; }
  });
  it("reports chapter and investigation end instants", () => {
    const c = paperClock(session, at(9));
    expect(c).toMatchObject({ phase: "running", chapter: 2, chapterEndsAt: at(20), endsAt: at(40) });
  });
  it("an organizer stop completes it immediately, never extends it", () => {
    const early = { startsAt: new Date(T0), endedAt: new Date(at(12)) };
    expect(paperClock(early, at(11, 59)).phase).toBe("running"); expect(paperClock(early, at(12))).toEqual({ phase: "complete", endedEarly: true });
    const late = { startsAt: new Date(T0), endedAt: new Date(at(90)) };
    expect(paperClock(late, at(40))).toEqual({ phase: "complete", endedEarly: false });
  });
  it("gives the organizer a fixed schedule from the start alone", () => { expect(schedule(new Date(T0)).map(s => s.at - T0)).toEqual([0, 8, 20, 30, 40].map(m => m * 60_000)); });
});
