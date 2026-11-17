import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { containmentCctv, containmentEvidence, containmentSolution, containmentValidator } from "../src/lib/game/containment.server";
import { inboxEvidence } from "../src/lib/game/inbox.server";
import { trailEvidence } from "../src/lib/game/trail.server";
import { insiderDossier } from "../src/lib/game/insider.server";
import { initialProgress, complete, bonus, useHint as consumeHint, score, current, permit } from "../src/lib/game/engine";
import { containmentAnswers } from "./fixtures/containment";

describe.each(["A", "B", "C"] as const)("Containment %s", variant => {
  const evidence = containmentEvidence(variant), answer = containmentAnswers[variant];
  it("continues exact Inbox/Trail/Insider facts with seven unsolved cards, two approved-workload decoys and consistent physical custody", () => {
    const inbox = inboxEvidence(variant), trail = trailEvidence(variant), insider = insiderDossier(variant), cctv = containmentCctv(variant);
    expect(evidence.events).toHaveLength(7); expect(evidence.observations).toHaveLength(2);
    expect(evidence.events.map(event => event.id)).not.toEqual(answer.eventOrder);
    expect([...evidence.events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).map(event => event.id)).toEqual(answer.eventOrder);
    const ordered = answer.eventOrder.map(id => evidence.events.find(event => event.id === id)!);
    expect(ordered[0].timestamp).toBe(insider.records.find(record => record.id === answer.supportingEvidenceIds[0])!.timestamp);
    expect(ordered[1].timestamp).toBe("2026-11-16T09:14:05Z"); expect(ordered[1].description).toContain(inbox.snapshot.redirectFrom);
    expect(ordered[2].timestamp).toBe(inbox.snapshot.capturedAt); expect(ordered[2].description).toContain(inbox.snapshot.url);
    const replay = trail.rows.find(event => event.sessionId === answer.sessionId && event.eventType === "session-validation")!;
    expect(ordered[3].timestamp).toBe(replay.timestamp); expect(ordered[3].sourceIds).toContain(replay.id); expect(ordered[3].description).toContain(replay.sourceIp);
    const database = inbox.artifacts.find(record => record.id === answer.supportingEvidenceIds[2])!;
    expect(ordered[4].timestamp).toBe(database.facts.Time); expect(ordered[4].description).toContain(database.facts.Operation);
    expect(Date.parse(ordered[5].timestamp)-Date.parse(ordered[4].timestamp)).toBe(30_000);
    expect(Date.parse(ordered[6].timestamp)-Date.parse(insider.records.find(record => record.id === cctv.custodyId)!.timestamp)).toBe(60_000);
    expect(ordered.slice(2, 5).every(event => event.principal === answer.account && event.sessionId === answer.sessionId)).toBe(true);
    for (const id of answer.supportingEvidenceIds.slice(0, 3)) { const old = [...inbox.artifacts, ...insider.records].find(record => record.id === id)!; expect(evidence.artifacts.find(record => record.id === id)!.facts).toEqual(old.facts); }
    const receipt = insider.records.find(record => record.id === cctv.sourceId)!;
    expect(cctv.timestamp).toBe(receipt.timestamp); expect(cctv.device).toBe(receipt.facts.Device); expect(cctv.employeeId).toBe(receipt.facts.Employee);
    expect(cctv.custody).toContain(cctv.custodyId); expect(cctv.observation).toContain("not intent");
    expect(evidence.observations.every(record => !answer.eventOrder.includes(record.id as never))).toBe(true);
    expect(JSON.stringify(evidence)).not.toMatch(/eventOrder|recoveryOrder|immediateActions|containmentSolution|dependencies|fragmentA|fragmentB/);
    expect(JSON.stringify(cctv)).not.toMatch(/REC-|ACT-|eventOrder|recoveryOrder|fragmentA|fragmentB/);
  });
  it("accepts equivalent safe topological orders and any order of the parallel immediate batch", () => {
    expect(containmentSolution(variant)).toEqual(answer);
    const r = answer.recoveryOrder;
    for (const order of [[r[0], r[1], r[2], ...r.slice(3)], [r[1], r[0], r[2], ...r.slice(3)], [r[1], r[2], r[0], ...r.slice(3)]]) expect(containmentValidator.validate({ ...answer, recoveryOrder: order, immediateActions: [...answer.immediateActions].reverse(), explanation: "Different evidence-backed wording." }, variant)).toEqual({ correct: true, points: 20 });
    expect(containmentValidator.validate({ ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds, `CUST-${variant}-01`] }, variant).correct).toBe(true);
  });
  it("rejects wrong targets, missing evidence, destructive actions, premature restoration and injected scores/selectors", () => {
    for (const invalid of [
      { ...answer, eventOrder: [...answer.eventOrder].reverse() }, { ...answer, eventOrder: [...answer.eventOrder.slice(0, 6), answer.eventOrder[0]] }, { ...answer, eventOrder: [...answer.eventOrder.slice(0, 6), "OBS-X-ARCHIVE"] },
      { ...answer, account: "svc-archive@nexus.example" }, { ...answer, sessionId: `nx-${variant.toLowerCase()}-managed` },
      { ...answer, immediateActions: answer.immediateActions.slice(1) }, { ...answer, immediateActions: [...answer.immediateActions, `ACT-${variant}-09`] }, { ...answer, immediateActions: [answer.immediateActions[0], answer.immediateActions[0], ...answer.immediateActions.slice(2)] },
      { ...answer, recoveryOrder: [...answer.recoveryOrder].reverse() }, { ...answer, recoveryOrder: answer.recoveryOrder.slice(1) }, { ...answer, recoveryOrder: [...answer.recoveryOrder, `REC-${variant}-06`] },
      { ...answer, supportingEvidenceIds: answer.supportingEvidenceIds.slice(1) }, { ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds, "unknown"] }, { ...answer, points: 20 }, { ...answer, teamId: "another" }, { ...answer, variant: "A" }, { ...answer, answerKey: answer }, { ...answer, explanation: "x".repeat(1001) },
    ]) expect(containmentValidator.validate(invalid, variant)).toEqual({ correct: false, points: 0 });
    for (const option of evidence.immediateOptions.filter(option => !answer.immediateActions.includes(option.id as never))) expect(containmentValidator.validate({ ...answer, immediateActions: [...answer.immediateActions.slice(1), option.id] }, variant).correct).toBe(false);
    expect(containmentValidator.validate(answer, variant === "A" ? "B" : "A").correct).toBe(false);
  });
});
it("exhaustively accepts exactly the three safe recovery permutations, without imposing one arbitrary total order", () => {
  function permutations(items: readonly string[]): string[][] { return items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]]; }
  const answer = containmentAnswers.A, r = answer.recoveryOrder;
  const accepted = permutations(r).filter(order => containmentValidator.validate({ ...answer, recoveryOrder: order }, "A").correct);
  expect(accepted).toEqual([[r[0], r[1], r[2], ...r.slice(3)], [r[1], r[0], r[2], ...r.slice(3)], [r[1], r[2], r[0], ...r.slice(3)]]);
});
it("retains the shared score ceiling, hint deductions, global bonus and Final Verdict progression", () => {
  for (const count of [0, 1, 2]) {
    const p = initialProgress(); for (const [i, points] of [15, 25, 25].entries()) complete(p, i, points, 1);
    bonus(p); for (let i = 0; i < count; i++) consumeHint(p, 3);
    complete(p, 3, 20, 2); expect(score(p)).toBe(90 - [0, 3, 9][count]); expect(current(p)).toBe(4); expect(p.chapters[3].score).toBe(20); expect(p.bonus).toBe(5);
    expect(() => bonus(p)).toThrow(); expect(() => complete(p, 3, 20, 3)).toThrow(); expect(() => permit(p, { startsAt: new Date(0), deadline: new Date(1), endedAt: null }, 4, 2)).toThrow("not active");
  }
});
it("keeps trusted plans server-only and refuses unknown variants", () => {
  expect(() => containmentEvidence("D")).toThrow("Unsupported Containment variant"); expect(containmentValidator.validate(containmentAnswers.A, "D").correct).toBe(false);
  expect(readFileSync("src/lib/game/containment.server.ts", "utf8")).toContain('import "server-only"'); expect(readFileSync("src/components/game/containment-desk.tsx", "utf8")).not.toContain(".server");
});
