import { describe, expect, it } from "vitest";
import { applyRaw, initialProgress, points, unlockThresholds, unlocked } from "../src/lib/game/engine";
import { nextChapterView } from "../src/lib/game/unlock-ui";

// The exact Round 1 thresholds from the rules: 8/15, 13/25, 13/25, 10/20. These are server-side engine rules, asserted at the boundary.
describe("Round 1 unlock thresholds (engine, authoritative)", () => {
  it("uses the documented thresholds and maxima", () => { expect([...unlockThresholds]).toEqual([8, 13, 13, 10]); expect([...points]).toEqual([15, 25, 25, 20, 15]); });
  for (const [chapter, need] of [[0, 8], [1, 13], [2, 13], [3, 10]] as const) {
    it(`chapter ${chapter + 1}: ${need - 1} stays locked, exactly ${need} unlocks chapter ${chapter + 2}, more stays unlocked`, () => {
      const p = initialProgress();
      expect(applyRaw(p, chapter, need - 1, 1)).toEqual([]); expect(unlocked(p, chapter + 1)).toBe(false);
      expect(applyRaw(p, chapter, need, 2)).toEqual([chapter + 1]); expect(unlocked(p, chapter + 1)).toBe(true);
      expect(applyRaw(p, chapter, Math.min(points[chapter], need + 1), 3)).toEqual([]); expect(unlocked(p, chapter + 1)).toBe(true);
      expect(p.chapters[chapter + 1].unlockedAt).toBe(2); // recorded once, monotonic
    });
  }
  it("a lower later score never re-locks a chapter", () => { const p = initialProgress(); applyRaw(p, 0, 9, 1); applyRaw(p, 0, 3, 2); expect(p.chapters[0].score).toBe(9); expect(unlocked(p, 1)).toBe(true); });
});

describe("nextChapterView: reads server state only", () => {
  const base = () => { const p = initialProgress(); return { progress: p, unlockThresholds: [...unlockThresholds], unlocked: [true, false, false, false, false] }; };
  it("below threshold: locked, shows the points still needed", () => { const s = base(); s.progress.chapters[0].score = 7; expect(nextChapterView(s, 0)).toMatchObject({ hasNext: true, unlocked: false, remaining: 1, need: 8, raw: 7 }); });
  it("a client-side score alone never unlocks: only the server's unlocked[] (or a confirmed submit response) does", () => {
    const s = base(); s.progress.chapters[0].score = 15; // pretend the cached score is high but the server has not unlocked
    expect(nextChapterView(s, 0)).toMatchObject({ unlocked: false });
    expect(nextChapterView({ ...s, unlocked: [true, true, false, false, false] }, 0)).toMatchObject({ unlocked: true });
    expect(nextChapterView(s, 0, [1])).toMatchObject({ unlocked: true }); // server-confirmed submit response
  });
  it("the final chapter has no next chapter", () => { expect(nextChapterView(base(), 4)).toEqual({ hasNext: false }); });
  it("flags a next chapter that was already started so the notice is not repeated", () => { const s = base(); s.unlocked[1] = true; s.progress.chapters[1].score = 5; expect(nextChapterView(s, 0)).toMatchObject({ unlocked: true, nextStarted: true }); });
});
