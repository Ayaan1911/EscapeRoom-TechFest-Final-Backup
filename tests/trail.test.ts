import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { trailEvidence, trailSolution, trailValidator } from "../src/lib/game/trail.server";
import { inboxEvidence, inboxSolution } from "../src/lib/game/inbox.server";
import { trailCsv } from "../src/lib/game/trail-csv.server";
import { csvCell } from "../src/lib/csv";
import { filterTrailRows, emptyTrailFilters } from "../src/lib/game/trail-view";
import { trailAnswers, trailTamper } from "./fixtures/trail";

describe.each(["A", "B", "C"] as const)("Trail variant %s", variant => {
  const evidence = trailEvidence(variant);
  const answer = trailAnswers[variant];
  it("contains 144 deterministic, complete, safe fictional records", () => {
    expect(trailEvidence(variant)).toEqual(evidence);
    expect(evidence.rows).toHaveLength(144);
    expect(new Set(evidence.rows.map(row => row.id)).size).toBe(144);
    for (const row of evidence.rows) {
      expect(Object.keys(row)).toHaveLength(12);
      expect(Object.values(row).every(value => typeof value === "string" && value.length > 0)).toBe(true);
      expect(row.account.endsWith("@nexus.example")).toBe(true);
      expect(row.sourceIp).toMatch(/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/);
      expect(Number.isFinite(Date.parse(row.timestamp))).toBe(true);
    }
    expect(JSON.stringify(evidence)).not.toMatch(/"(?:correct|solution|answerKey|positions|points|expected)"/);
    expect(evidence.rows.filter(row => row.details.includes("AI investigator"))).toHaveLength(1);
  });
  it("preserves the exact Inbox principal, session, source, capture and export timeline", () => {
    const inbox = inboxEvidence(variant);
    const inboxAnswer = inboxSolution(variant);
    const auth = inbox.artifacts.find(item => item.id === inboxAnswer.authenticationId)!;
    const db = inbox.artifacts.find(item => item.id === inboxAnswer.databaseId)!;
    const replay = evidence.rows.find(row => row.id === answer.eventId)!;
    const issuance = evidence.rows.find(row => row.id === answer.supportingEvidenceIds[0])!;
    expect(replay.account).toBe(inbox.recipient);
    expect(replay.sourceIp).toBe(auth.facts.Source);
    expect(replay.sessionId).toBe(inboxAnswer.sessionId);
    expect(Date.parse(replay.timestamp)).toBe(Date.parse(auth.facts.Time));
    expect(replay.correlationId).toBe(inbox.snapshot.campaign);
    expect(issuance.sessionId).toBe(replay.sessionId);
    expect(issuance.account).toBe(replay.account);
    expect(issuance.device).not.toBe(replay.device);
    expect(issuance.sourceIp).not.toBe(replay.sourceIp);
    expect(issuance.method).toContain("FIDO2");
    expect(Date.parse(issuance.timestamp)).toBeLessThan(Date.parse(inbox.snapshot.capturedAt));
    expect(Date.parse(inbox.snapshot.capturedAt)).toBeLessThan(Date.parse(replay.timestamp));
    expect(Date.parse(replay.timestamp)).toBeLessThan(Date.parse(db.facts.Time));
    expect(evidence.artifacts.find(item => item.id === db.id)?.facts).toEqual(db.facts);
    const access = evidence.rows.find(row => row.eventType === "database-access" && row.sessionId === replay.sessionId)!;
    expect(access.account).toBe(db.facts.Principal); expect(access.sourceIp).toBe(db.facts.Source);
    expect(Date.parse(access.timestamp)).toBe(Date.parse(db.facts.Time));
  });
  it("accepts exactly one observed authentication chain and eliminates documented decoys", () => {
    const accepted = evidence.rows.filter(row => trailValidator.validate({ ...answer, account: row.account, sourceIp: row.sourceIp, sessionId: row.sessionId, eventId: row.id }, variant).correct);
    expect(accepted.map(row => row.id)).toEqual([answer.eventId]);
    expect(trailSolution(variant)).toEqual(answer);
    const attempts = evidence.rows.filter(row => row.sourceIp === "198.51.100.77");
    expect(attempts.length).toBeGreaterThan(12);
    expect(attempts.every(row => row.result === "failure" && row.sessionId === "none")).toBe(true);
    const vpn = evidence.rows.filter(row => row.sourceIp === "203.0.113.61");
    expect(vpn.every(row => row.method.includes("FIDO2") && row.device.startsWith("NX-VPN"))).toBe(true);
    const maintenance = evidence.artifacts.find(item => item.id === `DB-${variant}-MAINT`)!;
    expect(maintenance.facts.Authorization).toContain(`CHG-${variant}-219`);
    expect(maintenance.facts.Operation).not.toContain("customer_directory");
    expect(trailValidator.validate({ ...answer, account: maintenance.facts.Principal, sourceIp: maintenance.facts.Source, sessionId: maintenance.facts.Session }, variant).correct).toBe(false);
    const revoked = evidence.rows.find(row => row.eventType === "session-revoke")!;
    expect(evidence.rows.filter(row => row.sessionId === revoked.sessionId).some(row => row.eventType === "database-access")).toBe(false);
  });
  it("strictly validates every component with stable scoring and wording-independent notes", () => {
    expect(trailValidator.validate({ ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds].reverse(), account: ` ${answer.account.toUpperCase()} `, explanation: "My wording is deliberately different." }, variant)).toEqual({ correct: true, points: 25, tamperDetected: false });
    for (const key of ["account", "sourceIp", "sessionId", "eventId"] as const) expect(trailValidator.validate({ ...answer, [key]: key === "account" ? "other@nexus.example" : key === "sourceIp" ? "192.0.2.88" : "wrong" }, variant).correct).toBe(false);
    expect(trailValidator.validate({ ...answer, supportingEvidenceIds: [answer.supportingEvidenceIds[0], answer.supportingEvidenceIds[0], answer.supportingEvidenceIds[2]] }, variant).correct).toBe(false);
    expect(trailValidator.validate({ ...answer, supportingEvidenceIds: [...answer.supportingEvidenceIds, "extra"] }, variant).correct).toBe(false);
    expect(trailValidator.validate({ ...answer, supportingEvidenceIds: ["unrelated", ...answer.supportingEvidenceIds.slice(1)] }, variant).correct).toBe(false);
    for (const extra of [{ points: 100 }, { teamId: "another" }, { variant: "A" }]) expect(trailValidator.validate({ ...answer, ...extra }, variant)).toEqual({ correct: false, points: 0 });
    expect(trailValidator.validate({ ...answer, explanation: "x".repeat(801) }, variant).correct).toBe(false);
    expect(trailValidator.validate(answer, variant === "A" ? "B" : "A").correct).toBe(false);
  });
  it("validates the untrusted instruction independently of a correct conclusion", () => {
    expect(trailValidator.validate(answer, variant).tamperDetected).toBe(false);
    expect(trailValidator.validate({ kind: "tamper", tamper: trailTamper(variant) }, variant)).toEqual({ correct: false, points: 0, tamperDetected: true });
    expect(trailValidator.validate({ ...answer, account: "wrong@nexus.example", tamper: trailTamper(variant) }, variant)).toEqual({ correct: false, points: 0, tamperDetected: true });
    expect(trailValidator.validate({ kind: "tamper", tamper: { ...trailTamper(variant), field: "account" } }, variant).correct).toBe(false);
    expect(trailValidator.validate({ kind: "tamper", tamper: { ...trailTamper(variant), eventId: "wrong" } }, variant).tamperDetected).toBe(false);
  });
  it("filters all record fields, related sessions and timestamps without mutating evidence", () => {
    const before = JSON.stringify(evidence);
    expect(filterTrailRows(evidence.rows, { ...emptyTrailFilters, search: ` ${answer.eventId.toLowerCase()} ` }).map(row => row.id)).toEqual([answer.eventId]);
    for (const [key, value] of Object.entries({ account: answer.account, sourceIp: answer.sourceIp, result: "success", eventType: "session-validation", sessionId: answer.sessionId })) {
      const rows = filterTrailRows(evidence.rows, { ...emptyTrailFilters, [key]: value });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row[key as keyof typeof row] === value)).toBe(true);
    }
    const sorted = filterTrailRows(evidence.rows, { ...emptyTrailFilters, descending: true });
    expect(Date.parse(sorted[0].timestamp)).toBeGreaterThanOrEqual(Date.parse(sorted.at(-1)!.timestamp));
    expect(filterTrailRows(evidence.rows, { ...emptyTrailFilters, search: "no-such-record" })).toHaveLength(0);
    expect(JSON.stringify(evidence)).toBe(before);
  });
  it("exports only the 12 evidence columns and escapes the planted formula", () => {
    const csv = trailCsv(evidence.rows);
    expect(csv.split("\r\n")).toHaveLength(145);
    expect(csv.split("\r\n")[0]).toBe('"id","timestamp","account","sourceIp","eventType","result","method","device","sessionId","conditionalAccess","correlationId","details"');
    expect(csv).toContain('"\'=ANALYST_NOTE(');
    expect(csv).not.toMatch(/answerKey|supportingEvidenceIds|expected|rawPoints/);
  });
});

it("escapes dangerous spreadsheet prefixes, quotes, commas and multiline cells", () => {
  for (const text of ["=1+1", "+SUM(1)", "-2", "@cmd", "\tformula", "\rline", "\nline", "   =1", "\u0000=1", "\ufeff@cmd"]) expect(csvCell(text).slice(1, -1).replaceAll('""', '"')).toBe(`'${text}`);
  expect(csvCell('ordinary "quoted", text\nsecond line')).toBe('"ordinary ""quoted"", text\nsecond line"');
  expect(csvCell(25)).toBe('"25"');
});
it("refuses unknown variants and keeps fixture modules server-only", () => {
  expect(() => trailEvidence("D")).toThrow("Unsupported Trail variant");
  expect(trailValidator.validate(trailAnswers.A, "D").correct).toBe(false);
  expect(readFileSync("src/lib/game/trail.server.ts", "utf8")).toContain('import "server-only"');
  expect(readFileSync("src/components/game/trail-desk.tsx", "utf8")).not.toContain(".server");
});
