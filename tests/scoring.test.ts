import { describe, expect, it } from "vitest";
import { applyRaw, initialProgress, overrideChapter, permit, points, progressSchema, score, start, unlocked, unlockThresholds, useHint } from "../src/lib/game/engine";
import { catalog, chapterMax, criterionPoints } from "../src/lib/game/scoring";
import { validators } from "../src/lib/game/validators";
import { inboxAnswers } from "./fixtures/inbox";
import { trailAnswers } from "./fixtures/trail";
import { insiderAnswers } from "./fixtures/insider";
import { containmentAnswers } from "./fixtures/containment";
import { verdictAnswers, maintenanceRejections } from "./fixtures/verdict";

const V = ["A", "B", "C"] as const;
const answers = [inboxAnswers, trailAnswers, insiderAnswers, containmentAnswers, verdictAnswers] as const;
const allCriteria = (chapter: number) => catalog[chapter].flatMap(task => Object.keys(task.criteria).map(key => `${task.id}:${key}`)).sort();
const earned = (chapter: number, answer: unknown, variant: string) => validators[chapter]!.grade(answer, variant).reduce((n, id) => n + criterionPoints.get(id)!, 0);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (value: unknown): any => JSON.parse(JSON.stringify(value));

describe("task catalog", () => {
  it("keeps every chapter maximum unchanged (100 + 5 bonus = 105)", () => {
    expect(points.map((_, i) => chapterMax(i))).toEqual([15, 25, 25, 20, 15]);
    expect(unlockThresholds).toEqual([8, 13, 13, 10]);
    expect(new Set(catalog.flat().map(task => task.id)).size).toBe(catalog.flat().length);
  });
});
describe("graders agree with the legacy all-or-nothing validators for every variant", () => {
  for (const chapter of [0, 1, 2, 3, 4]) for (const variant of V) {
    it(`chapter ${chapter + 1} variant ${variant}: full answer earns every criterion`, () => {
      const answer = (answers[chapter] as Record<string, unknown>)[variant];
      expect(validators[chapter]!.validate(answer, variant).correct).toBe(true);
      expect(validators[chapter]!.grade(answer, variant).sort()).toEqual(allCriteria(chapter));
      expect(earned(chapter, answer, variant)).toBe(points[chapter]);
    });
  }
  it("Final Verdict accepts either valid contradiction", () => {
    for (const variant of V) {
      const answer = { ...verdictAnswers[variant], rejected: maintenanceRejections[variant] };
      expect(validators[4]!.validate(answer, variant).correct).toBe(true);
      expect(earned(4, answer, variant)).toBe(15);
    }
  });
  it("malformed, empty and wrong-variant answers do not earn full marks", () => {
    for (const chapter of [0, 1, 2, 3, 4]) {
      expect(validators[chapter]!.grade({}, "A")).toEqual([]);
      expect(validators[chapter]!.grade(null, "A")).toEqual([]);
      expect(validators[chapter]!.grade((answers[chapter] as Record<string, unknown>).A, "Z")).toEqual([]);
      expect(earned(chapter, (answers[chapter] as Record<string, unknown>).B, "A")).toBeLessThan(points[chapter]);
    }
  });
  it("rejects scores and unknown fields supplied by the client", () => {
    for (const chapter of [0, 1, 2, 3, 4]) {
      const answer = { ...clone((answers[chapter] as Record<string, unknown>).A), score: 999, points: 999 };
      expect(validators[chapter]!.grade(answer, "A")).toEqual([]);
    }
  });
});
describe("partial credit is per independently verifiable criterion", () => {
  it("Inbox: each field earns its own points in every variant", () => {
    for (const variant of V) {
      const wrong = { ...inboxAnswers[variant], emailId: "x-wrong", deliveryId: "x-wrong", snapshotId: "x-wrong", authenticationId: "x-wrong", databaseId: "x-wrong", sessionId: "x-wrong" };
      expect(earned(0, wrong, variant)).toBe(0);
      expect(earned(0, { ...wrong, emailId: inboxAnswers[variant].emailId }, variant)).toBe(2);
      expect(earned(0, { ...wrong, authenticationId: inboxAnswers[variant].authenticationId, sessionId: inboxAnswers[variant].sessionId }, variant)).toBe(6);
      expect(earned(0, { ...inboxAnswers[variant], databaseId: "x-wrong" }, variant)).toBe(12);
    }
  });
  it("Trail: right account without the replayed event earns only the account", () => {
    const a = { ...trailAnswers.A, sourceIp: "192.0.2.1", sessionId: "x-wrong", eventId: "EV-x", supportingEvidenceIds: ["x-1", "x-2", "x-3"] };
    expect(earned(1, a, "A")).toBe(4);
    expect(earned(1, { ...a, supportingEvidenceIds: [trailAnswers.A.supportingEvidenceIds[0], "x-2", "x-3"] }, "A")).toBe(6);
  });
  it("Insider: corroboration is withheld when an id outside the allowed set is submitted", () => {
    const a = insiderAnswers.A;
    expect(earned(2, { ...a, supportingEvidenceIds: [...a.supportingEvidenceIds, "ACC-A-99"] }, "A")).toBe(15);
    expect(earned(2, { ...a, employeeId: "EMP-A-01" }, "A")).toBe(17);
  });
  it("Containment: recovery ordering only scores when the right recovery set is chosen", () => {
    const a = containmentAnswers.A;
    const reversed = clone(a); reversed.recoveryOrder = [...a.recoveryOrder].reverse();
    expect(earned(3, reversed, "A")).toBeLessThan(20);
    const extra = clone(a); extra.immediateActions = [...a.immediateActions, "ACT-A-05"];
    expect(earned(3, extra, "A")).toBe(16); // one wrong extra action zeroes the urgent-response task (4); nothing else changes
    const wrongSet = clone(a); wrongSet.recoveryOrder = [...a.recoveryOrder.slice(0, 5), "REC-A-05"];
    expect(validators[3]!.grade(wrongSet, "A").filter(id => id.startsWith("containment.recovery"))).toEqual([]);
    const late = clone(a); late.eventOrder = [...a.eventOrder.slice(0, 3), ...a.eventOrder.slice(3).reverse()];
    expect(validators[3]!.grade(late, "A")).toContain("containment.timeline:early");
    expect(validators[3]!.grade(late, "A")).not.toContain("containment.timeline:middle");
  });
  it("Final Verdict: evidence reused across roles loses the evidence map", () => {
    const a = clone(verdictAnswers.A); a.evidenceMap.response = [...a.evidenceMap.impact];
    expect(validators[4]!.grade(a, "A").filter(id => id.startsWith("verdict.evidence"))).toEqual([]);
    expect(earned(4, a, "A")).toBe(10);
  });
});
describe("unlock progression (pure engine)", () => {
  const withRaw = (chapter: number, raw: number) => { const p = initialProgress(); applyRaw(p, chapter, raw, 1); return p; };
  it("unlocks the next chapter exactly at each threshold and not below", () => {
    unlockThresholds.forEach((threshold, i) => {
      expect(unlocked(withRaw(i, threshold - 1), i + 1)).toBe(false);
      expect(unlocked(withRaw(i, threshold), i + 1)).toBe(true);
      expect(applyRaw(initialProgress(), i, threshold, 5)).toEqual([i + 1]);
    });
    expect(unlocked(initialProgress(), 0)).toBe(true);
    for (const bad of [-1, 5, 0.5]) expect(unlocked(initialProgress(), bad)).toBe(false);
  });
  it("is monotonic: a lower raw value never lowers the score or relocks", () => {
    const p = withRaw(0, 10); applyRaw(p, 0, 2, 9);
    expect(p.chapters[0].score).toBe(10); expect(unlocked(p, 1)).toBe(true);
    expect(applyRaw(p, 0, 12, 10)).toEqual([]); // already recorded: reported once only
    expect(p.chapters[1].unlockedAt).toBe(1);
  });
  it("hint deductions never reduce raw unlock progress", () => {
    const p = initialProgress(); useHint(p, 0); useHint(p, 0); applyRaw(p, 0, 8, 1);
    expect(unlocked(p, 1)).toBe(true); expect(p.chapters[0].score).toBe(8); expect(score(p)).toBe(0);
  });
  it("totals stay within 0-105", () => {
    const p = initialProgress(); points.forEach((v, i) => applyRaw(p, i, v, 1)); p.bonus = 5;
    expect(score(p)).toBe(105);
  });
  it("locked chapters are rejected, unlocked incomplete ones are open, completed ones are closed", () => {
    const round = start({ startsAt: null, deadline: null, endedAt: null }, 1000), p = withRaw(0, 8);
    expect(() => permit(p, round, 2, 2000)).toThrow(/locked/);
    expect(() => permit(p, round, 1, 2000)).not.toThrow();
    expect(() => permit(p, round, 0, 2000)).not.toThrow();
    applyRaw(p, 0, 15, 5);
    expect(() => permit(p, round, 0, 2000)).toThrow(/already completed/);
  });
  it("legacy completed records still parse and unlock their successor", () => {
    const blank = { score: 0, hints: 0, completedAt: null, override: false };
    const legacy = progressSchema.parse({ chapters: [{ score: 15, hints: 1, completedAt: 5, override: false }, blank, blank, blank, blank], bonus: 5, completedAt: null });
    expect(unlocked(legacy, 1)).toBe(true); expect(unlocked(legacy, 2)).toBe(false); expect(score(legacy)).toBe(17);
  });
  it("organizer override completes the first chapter whose successor is locked, keeping earned points", () => {
    const p = withRaw(0, 3);
    expect(overrideChapter(p, 7)).toBe(0);
    expect(p.chapters[0]).toMatchObject({ score: 3, completedAt: 7, override: true }); expect(unlocked(p, 1)).toBe(true);
    const q = withRaw(0, 9); applyRaw(q, 1, 5, 2);
    expect(overrideChapter(q, 8)).toBe(1);
    expect(q.chapters[1].score).toBe(5); expect(unlocked(q, 2)).toBe(true); expect(q.chapters[0].completedAt).toBeNull();
  });
});
