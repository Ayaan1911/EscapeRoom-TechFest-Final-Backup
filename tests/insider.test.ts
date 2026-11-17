import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { insiderDossier, insiderSolution, insiderValidator } from "../src/lib/game/insider.server";
import { insiderPrintPages, insiderWallStation, matchesInsiderFragments, newInsiderFragments } from "../src/lib/game/insider-fragments.server";
import { inboxEvidence } from "../src/lib/game/inbox.server";
import { trailEvidence } from "../src/lib/game/trail.server";
import { insiderAnswers } from "./fixtures/insider";

it("generates 50 independent pairs, rejects every other team's pair and mixed fragment, and paginates without combining parts", () => {
  const pairs = Array.from({ length: 50 }, newInsiderFragments);
  expect(new Set(pairs.map(pair => pair.fragmentA)).size).toBe(50);
  expect(new Set(pairs.map(pair => pair.fragmentB)).size).toBe(50);
  for (const [i, own] of pairs.entries()) {
    expect(own.fragmentA).toMatch(/^A-([A-F\d]{6}-){3}[A-F\d]{6}$/);
    expect(matchesInsiderFragments(own, { fragmentA: own.fragmentA.toLowerCase().replaceAll("-", " "), fragmentB: own.fragmentB })).toBe(true);
    for (const [j, other] of pairs.entries()) {
      expect(matchesInsiderFragments(own, other)).toBe(i === j);
      expect(matchesInsiderFragments(own, { fragmentA: own.fragmentA, fragmentB: other.fragmentB })).toBe(i === j);
    }
    for (const invalid of [{}, { ...own, points: 25 }, { ...own, fragmentA: "x".repeat(65) }, { fragmentA: own.fragmentB, fragmentB: own.fragmentA }]) expect(matchesInsiderFragments(own, invalid)).toBe(false);
  }
  for (const part of ["A", "B"] as const) {
    const cards = pairs.map((pair, i) => ({ teamId: `TEAM-${i}`, station: insiderWallStation(`TEAM-${i}`), fragment: part === "A" ? pair.fragmentA : pair.fragmentB }));
    const pages = insiderPrintPages(cards, part);
    expect(pages.flatMap(page => page.cards)).toHaveLength(50);
    expect(pages.every(page => page.cards.length <= 12)).toBe(true);
    if (part === "B") expect(pages.every(page => page.cards.every(card => card.station === page.station))).toBe(true);
    expect(JSON.stringify(pages)).not.toContain(part === "A" ? pairs[0].fragmentB : pairs[0].fragmentA);
  }
  expect(insiderWallStation("TEAM-1")).toBe(insiderWallStation("TEAM-1"));
});

describe.each(["A", "B", "C"] as const)("Insider %s", variant => {
  const dossier = insiderDossier(variant), answer = insiderAnswers[variant];
  it("provides comparable retained evidence, individually attributable actions and documented innocent alternatives", () => {
    expect(dossier.suspects).toHaveLength(6); expect(dossier.records).toHaveLength(26);
    expect(new Set(dossier.records.map(record => record.id)).size).toBe(26);
    expect(dossier.records.reduce<Record<string, number>>((counts, record) => ({ ...counts, [record.kind]: (counts[record.kind] ?? 0) + 1 }), {})).toEqual({ access: 6, policy: 7, message: 5, approval: 3, custody: 1, timeline: 4 });
    const action = dossier.records.find(record => record.id === answer.actionId)!;
    expect(action.employees).toEqual([answer.employeeId]);
    const instruction = dossier.records.find(record => record.id === answer.supportingEvidenceIds[0])!;
    expect(instruction.facts["Authoring device"]).toBe(action.facts.Device);
    expect(instruction.facts.Text).toContain("after the export slot");
    expect(dossier.records.find(record => record.id === answer.supportingEvidenceIds[2])!.facts["Approved scope"]).toContain("no identity-policy exception");
    for (const person of dossier.suspects.filter(person => person.id !== answer.employeeId)) {
      const commands = dossier.records.filter(record => record.kind === "policy" && record.employees.includes(person.id));
      expect(commands).toHaveLength(1); expect(commands[0].id).toContain("STAFF");
      expect(commands[0].facts.Scope).toBeTruthy();
      expect(insiderValidator.validate({ ...answer, employeeId: person.id }, variant).correct).toBe(false);
    }
    expect(answer.employeeId).not.toBe(dossier.suspects[0].id);
    expect(dossier.records.every(record => record.provenance && !Number.isNaN(Date.parse(record.timestamp)))).toBe(true);
  });
  it("preserves the exact prior capture, session, source, maintenance scope and export chronology", () => {
    const inbox = inboxEvidence(variant), trail = trailEvidence(variant);
    for (const artifact of inbox.artifacts.filter(artifact => ["AUTH", "DB"].some(prefix => artifact.id.startsWith(prefix)))) {
      const retained = dossier.records.find(record => record.id === artifact.id);
      if (retained) expect(retained.facts).toEqual(artifact.facts);
    }
    expect(dossier.records.find(record => record.id === inbox.snapshot.id)!.timestamp).toBe(inbox.snapshot.capturedAt);
    expect(Date.parse(dossier.records.find(record => record.id === answer.actionId)!.timestamp)).toBeLessThan(Date.parse(inbox.snapshot.capturedAt));
    const maintenance = trail.artifacts.find(record => record.id === `CHG-${variant}-219`)!;
    const approval = dossier.records.find(record => record.id === answer.supportingEvidenceIds[2])!;
    for (const [key, value] of Object.entries(maintenance.facts)) expect(approval.facts[key]).toBe(value);
  });
  it("requires identity, action and all three corroborations with no prose keywords or client points", () => {
    expect(insiderSolution(variant)).toEqual(answer);
    expect(insiderValidator.validate({ ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds].reverse(), explanation: "Different wording." }, variant)).toEqual({ correct: true, points: 25 });
    expect(insiderValidator.validate({ ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds, `CUST-${variant}-01`] }, variant).correct).toBe(true);
    for (const invalid of [{ ...answer, actionId: `POL-${variant}-STAFF-1` }, { ...answer, supportingEvidenceIds: answer.supportingEvidenceIds.slice(1) }, { ...answer, supportingEvidenceIds: [answer.supportingEvidenceIds[0], answer.supportingEvidenceIds[0], answer.supportingEvidenceIds[2]] }, { ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds, "unknown"] }, { ...answer, points: 100 }, { ...answer, teamId: "another" }, { ...answer, explanation: "x".repeat(801) }]) expect(insiderValidator.validate(invalid, variant)).toEqual({ correct: false, points: 0 });
    expect(insiderValidator.validate(answer, variant === "A" ? "B" : "A").correct).toBe(false);
    expect(JSON.stringify(dossier)).not.toMatch(/supportingEvidenceIds|insiderSolution|answerKey/);
  });
});
it("keeps dossier fixtures, random credentials and answer keys server-only", () => {
  expect(() => insiderDossier("D")).toThrow("Unsupported Insider variant");
  for (const file of ["insider", "insider-fragments", "insider-kit", "insider-access"]) expect(readFileSync(`src/lib/game/${file}.server.ts`, "utf8")).toContain('import "server-only"');
  expect(readFileSync("src/components/game/insider-desk.tsx", "utf8")).not.toContain(".server");
});
