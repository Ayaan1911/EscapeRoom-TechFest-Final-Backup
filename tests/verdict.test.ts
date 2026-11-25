import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verdictEvidence, verdictSolution, verdictValidator } from "../src/lib/game/verdict.server";
import { inboxEvidence, inboxSolution } from "../src/lib/game/inbox.server";
import { trailEvidence, trailSolution } from "../src/lib/game/trail.server";
import { insiderDossier, insiderSolution } from "../src/lib/game/insider.server";
import { containmentEvidence } from "../src/lib/game/containment.server";
import { verdictAnswers, maintenanceRejections } from "./fixtures/verdict";

describe.each(["A", "B", "C"] as const)("Final Verdict %s", variant => {
  const answer = verdictAnswers[variant], evidence = verdictEvidence(variant);
  it("preserves the exact four-chapter identities, records, policy attribution and chronology without executing the prepared plan", () => {
    const inbox = inboxEvidence(variant), entry = inboxSolution(variant), trail = trailEvidence(variant), replay = trailSolution(variant), insider = insiderDossier(variant), accomplice = insiderSolution(variant), containment = containmentEvidence(variant);
    expect(answer.chain).toEqual({ emailId: entry.emailId, victimAccount: inbox.recipient, captureId: inbox.snapshot.id, campaign: inbox.snapshot.campaign, sessionId: entry.sessionId, exportId: entry.databaseId, insiderId: accomplice.employeeId, policyId: accomplice.actionId });
    expect(answer.chain.insiderId).not.toBe(insider.suspects[0].id);
    expect(evidence.timeline).toEqual(containment.events.map(({ id, timestamp, title, sourceIds }) => ({ id, timestamp, title, sourceIds })));
    for (const id of answer.evidenceMap.session) { const original = trail.rows.find(row => row.id === id)!; const record = evidence.records.find(row => row.id === id)!; expect(record.facts.Time).toBe(original.timestamp); expect(record.facts.Principal).toBe(original.account); expect(record.facts.Session).toBe(original.sessionId); expect(record.facts.Source).toBe(original.sourceIp); }
    expect(answer.evidenceMap.session).toEqual([replay.supportingEvidenceIds[0], replay.eventId]);
    for (const record of [...inbox.artifacts, ...insider.records, ...containment.artifacts]) { const copied = evidence.records.find(item => item.id === record.id); if (copied && record.id !== inbox.snapshot.id) for (const [key, value] of Object.entries(record.facts)) expect(copied.facts[key]).toBe(value); }
    expect(evidence.records.find(item => item.id === inbox.snapshot.id)!.facts).toMatchObject({ Time: inbox.snapshot.capturedAt, Campaign: inbox.snapshot.campaign, Recipient: inbox.snapshot.recipient, "Redirect from": inbox.snapshot.redirectFrom, Destination: inbox.snapshot.url });
    const timeline = [...evidence.timeline].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    expect(timeline.map(item => item.timestamp.slice(11, 19))).toEqual(["09:11:18", "09:14:05", "09:14:07", "09:16:22", "09:18:04", "09:18:34", "09:32:00"]);
    // Full candidate sets (all emails, both sign-ins, the whole insider policy/approval/message/access set) so the record list does not pre-select the answer.
    expect(new Set(evidence.records.map(item => item.id)).size).toBe(41); expect(evidence.records).toHaveLength(41);
    expect(new Set(evidence.records.map(item => item.chapter))).toEqual(new Set(["Inbox", "Trail", "Insider", "Containment"]));
    expect(JSON.stringify(evidence)).not.toMatch(/evidenceMap|verdictSolution|answerKey|fragmentA|fragmentB|correctHypothesis/);
    expect(evidence.summary.join(" ")).toContain("prepared an evidence-preserving response plan");
  });
  it("requires independent evidence roles and accepts either genuine counter-explanation with order-independent ID sets", () => {
    expect(verdictSolution(variant)).toEqual(answer); expect(verdictSolution(variant, "maintenance").rejected).toEqual(maintenanceRejections[variant]);
    expect(verdictValidator.validate(answer, variant)).toEqual({ correct: true, points: 15 });
    const evidenceMap = Object.fromEntries(Object.entries(answer.evidenceMap).map(([role, ids]) => [role, [...ids].reverse()]));
    expect(verdictValidator.validate({ ...answer, evidenceMap, explanation: "Different wording, without keyword scoring." }, variant)).toEqual({ correct: true, points: 15 });
    expect(verdictValidator.validate({ ...answer, rejected: maintenanceRejections[variant] }, variant).correct).toBe(true);
    expect(verdictValidator.validate({ ...answer, evidenceMap: { ...answer.evidenceMap, entry: [...answer.evidenceMap.entry, `GW-${variant}-01`], assistance: [...answer.evidenceMap.assistance, `CHG-${variant}-219`] } }, variant).correct).toBe(true);
    for (const [role, ids] of Object.entries(answer.evidenceMap)) {
      expect(verdictValidator.validate({ ...answer, evidenceMap: { ...answer.evidenceMap, [role]: ids.slice(1) } }, variant).correct).toBe(false);
      expect(verdictValidator.validate({ ...answer, evidenceMap: { ...answer.evidenceMap, [role]: [...ids, ids[0]] } }, variant).correct).toBe(false);
      expect(verdictValidator.validate({ ...answer, evidenceMap: { ...answer.evidenceMap, [role]: [...ids, "unknown"] } }, variant).correct).toBe(false);
    }
    expect(Object.values(answer.evidenceMap).flat()).toHaveLength(12);
  });
  it("rejects mixed variants, wrong sessions/exports, unsupported attribution, invalid counter-evidence and client-controlled fields", () => {
    const other = verdictAnswers[variant === "A" ? "B" : "A"];
    for (const key of Object.keys(answer.chain) as (keyof typeof answer.chain)[]) expect(verdictValidator.validate({ ...answer, chain: { ...answer.chain, [key]: other.chain[key] } }, variant).correct).toBe(false);
    for (const invalid of [
      { ...answer, chain: { ...answer.chain, sessionId: `nx-${variant.toLowerCase()}-managed` } }, { ...answer, chain: { ...answer.chain, exportId: `DB-${variant}-MAINT` } },
      { ...answer, hypothesisId: answer.rejected.hypothesisId }, { ...answer, rejected: { ...answer.rejected, hypothesisId: answer.hypothesisId } },
      { ...answer, rejected: { ...answer.rejected, evidenceIds: [answer.chain.emailId, answer.chain.exportId] } }, { ...answer, rejected: { ...answer.rejected, contradiction: "outside-approved-scope" } },
      { ...answer, evidenceMap: { ...answer.evidenceMap, impact: [...answer.evidenceMap.impact, answer.chain.policyId] } },
      { ...answer, attackerAttribution: "real-identity-proven" }, { ...answer, attackerAttribution: "location-proven" }, { ...answer, responseStatus: "recovery-executed" },
      { ...answer, motive: "revenge" }, { ...answer, points: 105 }, { ...answer, variant: "A" }, { ...answer, teamId: "other" }, { ...answer, answerKey: answer }, { ...answer, explanation: "x".repeat(1001) },
    ]) expect(verdictValidator.validate(invalid, variant)).toEqual({ correct: false, points: 0 });
    expect(verdictValidator.validate(answer, variant === "A" ? "B" : "A").correct).toBe(false);
  });
});
it("keeps answer keys server-only and refuses unknown cases", () => {
  expect(() => verdictEvidence("D")).toThrow("Unsupported Verdict variant"); expect(verdictValidator.validate(verdictAnswers.A, "D").correct).toBe(false);
  expect(readFileSync("src/lib/game/verdict.server.ts", "utf8")).toContain('import "server-only"'); expect(readFileSync("src/components/game/verdict-desk.tsx", "utf8")).not.toContain(".server");
});
