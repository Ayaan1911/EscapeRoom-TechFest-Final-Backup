import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inboxEvidence, inboxSolution, inboxValidator } from "../src/lib/game/inbox.server";
import { inboxQr, inboxQrTarget } from "../src/lib/game/inbox-qr.server";
import { inboxAnswers, tamperAnswer } from "./fixtures/inbox";

describe.each(["A", "B", "C"] as const)("Inbox variant %s", variant => {
  const evidence = inboxEvidence(variant);
  const answer = inboxAnswers[variant];
  it("has six complete emails and exactly one supported chain", () => {
    expect(evidence.emails).toHaveLength(6);
    expect(new Set(evidence.emails.map(email => email.id)).size).toBe(6);
    const accepted = [];
    for (const email of evidence.emails) for (const auth of evidence.artifacts.filter(item => item.kind === "authentication")) for (const db of evidence.artifacts.filter(item => item.kind === "database")) {
      const candidate = { ...answer, emailId: email.id, authenticationId: auth.id, databaseId: db.id };
      if (inboxValidator.validate(candidate, variant).correct) accepted.push(candidate);
    }
    expect(accepted).toEqual([answer]);
    expect(inboxSolution(variant)).toEqual(answer);
    for (const email of evidence.emails) {
      expect(email).toEqual(expect.objectContaining({ sender: expect.any(String), address: expect.stringContaining(".example"), recipient: evidence.recipient, timestamp: expect.any(String), body: expect.any(String), headers: expect.any(Object) }));
      expect(email.links.length + email.attachments.length).toBeGreaterThan(0);
      for (const link of email.links) expect(new URL(link).hostname.endsWith(".example")).toBe(true);
    }
    const auth = evidence.artifacts.find(item => item.id === answer.authenticationId)!;
    const db = evidence.artifacts.find(item => item.id === answer.databaseId)!;
    expect(auth.facts.Session).toBe(db.facts.Session);
    expect(auth.facts.Principal).toBe(evidence.recipient);
    expect(auth.facts["Redirect correlation"]).toContain(evidence.snapshot.campaign);
    expect(db.facts.Source).toBe(auth.facts.Source);
    expect(Date.parse(evidence.snapshot.capturedAt)).toBeLessThan(Date.parse(auth.facts.Time));
    expect(Date.parse(auth.facts.Time)).toBeLessThan(Date.parse(db.facts.Time));
  });
  it("requires every structured correlation and ignores harmless prose differences", () => {
    expect(inboxValidator.validate({ ...answer, explanation: "This conclusion is supported by the recorded session, regardless of my phrasing." }, variant)).toEqual({ correct: true, points: 15, tamperDetected: false });
    expect(inboxValidator.validate({ ...answer, snapshotId: ` ${answer.snapshotId} `, sessionId: ` ${answer.sessionId} ` }, variant).correct).toBe(true);
    for (const key of ["emailId", "deliveryId", "snapshotId", "authenticationId", "databaseId", "sessionId"] as const) {
      expect(inboxValidator.validate({ ...answer, [key]: "unrelated" }, variant).correct).toBe(false);
      const missing: Record<string, unknown> = { ...answer }; delete missing[key];
      expect(inboxValidator.validate(missing, variant).correct).toBe(false);
    }
    for (const extra of [{ points: 100 }, { teamId: "another-team" }, { variant: "A" }]) expect(inboxValidator.validate({ ...answer, ...extra }, variant)).toEqual({ correct: false, points: 0 });
    expect(inboxValidator.validate({ ...answer, explanation: "x".repeat(801) }, variant).correct).toBe(false);
  });
  it("validates manipulation independently and never gives a free bonus for the main answer", () => {
    expect(inboxValidator.validate(answer, variant).tamperDetected).toBe(false);
    expect(inboxValidator.validate({ ...answer, emailId: "wrong", tamper: tamperAnswer(variant) }, variant)).toEqual({ correct: false, points: 0, tamperDetected: true });
    expect(inboxValidator.validate({ kind: "tamper", tamper: tamperAnswer(variant) }, variant)).toEqual({ correct: false, points: 0, tamperDetected: true });
    expect(inboxValidator.validate({ kind: "tamper", tamper: { ...tamperAnswer(variant), artifactId: "wrong" } }, variant).tamperDetected).toBe(false);
    expect(inboxValidator.validate({ ...answer, tamper: tamperAnswer(variant === "A" ? "B" : "A") }, variant).tamperDetected).toBe(false);
  });
  it("only exports participant evidence, without solution metadata", () => {
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(/"(?:correct|solution|answerKey|entry|points|requiredEvidence)"/);
    expect(evidence.emails.flatMap(email => email.attachments).filter(attachment => attachment.text?.includes("AI assistant"))).toHaveLength(1);
    expect(evidence.emails.find(email => email.id === answer.emailId)!.links).toContain(evidence.snapshot.redirectFrom);
    expect(JSON.stringify({ emails: evidence.emails, artifacts: evidence.artifacts })).not.toContain(evidence.snapshot.id);
  });
});

it("uses different compromise positions and refuses unknown server variants", () => {
  expect(new Set(Object.values(inboxAnswers).map(answer => answer.emailId.slice(-2))).size).toBe(3);
  expect(() => inboxEvidence("D")).toThrow("Unsupported Inbox variant");
  expect(inboxValidator.validate(inboxAnswers.A, "D").correct).toBe(false);
  expect(inboxValidator.validate(inboxAnswers.A, "B").correct).toBe(false);
  expect(readFileSync("src/lib/game/inbox.server.ts", "utf8")).toContain('import "server-only"');
  expect(readFileSync("src/lib/game/validators.ts", "utf8")).toContain('import "server-only"');
  expect(readFileSync("src/components/game/inbox-desk.tsx", "utf8")).not.toContain("inbox.server");
});

it("generates a local PNG QR for a phone-reachable app origin with a fixed authenticated path", async () => {
  const result = await inboxQr("https://escape.nexus.example");
  expect(result.target).toBe("https://escape.nexus.example/clue/inbox");
  expect(result.image).toMatch(/^data:image\/png;base64,/);
  expect(inboxQrTarget("http://192.168.1.25:3000")).toBe("http://192.168.1.25:3000/clue/inbox");
  for (const origin of ["http://localhost:3000", "https://localhost.", "https://127.0.0.1", "https://[::1]", "https://[::]", "https://user:secret@event.example", "http://event.example", "https://event.example/path", "https://event.example/?variant=B", "javascript:alert(1)", ""]) expect(() => inboxQrTarget(origin)).toThrow();
});
