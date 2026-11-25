import { existsSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BUILTIN_CASE, parseRound1Case, setRound1CaseForTests, type Round1Case } from "../src/lib/game/case-key.server";
import { inboxEvidence, inboxSolution, inboxValidator } from "../src/lib/game/inbox.server";
import { trailEvidence, trailSolution, trailValidator } from "../src/lib/game/trail.server";
import { insiderDossier, insiderSolution, insiderValidator } from "../src/lib/game/insider.server";
import { containmentEvidence, containmentSolution, containmentValidator } from "../src/lib/game/containment.server";
import { verdictEvidence, verdictSolution, verdictValidator } from "../src/lib/game/verdict.server";
import { generateRound1Case } from "../scripts/round1-case-lib.mjs";

const unique = (ids: string[]) => expect(new Set(ids).size, "duplicate evidence ids").toBe(ids.length);
const json = (x: unknown) => JSON.stringify(x);

function checkCase(key: Round1Case) {
  setRound1CaseForTests(key);
  for (const v of ["A", "B", "C"] as const) {
    const inbox = inboxEvidence(v), i = inboxSolution(v);
    unique([...inbox.emails.map(e => e.id), ...inbox.artifacts.map(a => a.id)]);
    for (const id of [i.emailId, i.deliveryId, i.authenticationId, i.databaseId]) expect(json(inbox)).toContain(id);
    expect(inboxValidator.validate(i, v)).toMatchObject({ correct: true, points: 15 });

    const trail = trailEvidence(v), t = trailSolution(v);
    unique(trail.rows.map(r => r.id)); expect(trail.rows.map(r => r.id)).toContain(t.eventId);
    expect(trail.rows.find(r => r.id === t.eventId)?.sessionId).toBe(i.sessionId);
    expect(trailValidator.validate(t, v)).toMatchObject({ correct: true, points: 25 });

    const dossier = insiderDossier(v), s = insiderSolution(v);
    unique(dossier.records.map(r => r.id));
    for (const id of [s.employeeId, s.actionId, ...s.supportingEvidenceIds]) expect(json(dossier)).toContain(id);
    expect(insiderValidator.validate(s, v)).toEqual({ correct: true, points: 25 });

    const cont = containmentEvidence(v), c = containmentSolution(v);
    unique([...cont.events.map(e => e.id)]); unique(cont.immediateOptions.map(o => o.id)); unique(cont.recoveryOptions.map(o => o.id));
    expect(containmentValidator.validate(c, v)).toEqual({ correct: true, points: 20 });

    const verdict = verdictEvidence(v), vs = verdictSolution(v);
    unique(verdict.records.map(r => r.id)); unique(verdict.hypotheses.map(h => h.id));
    expect(verdictValidator.validate(vs, v)).toEqual({ correct: true, points: 15 });
    expect(verdictValidator.validate(verdictSolution(v, "maintenance"), v)).toEqual({ correct: true, points: 15 });
    // Verdict no longer pre-selects: every email, both sign-ins, the full insider policy set are present.
    for (const e of inbox.emails) expect(verdict.records.map(r => r.id)).toContain(e.id);
    for (const a of inbox.artifacts.filter(a => a.kind === "authentication")) expect(verdict.records.map(r => r.id)).toContain(a.id);
    expect(verdict.records.filter(r => r.id.startsWith(`POL-${v}-`)).length).toBe(7);
    // No answer leaks into a wrong variant
    const other = v === "A" ? "B" : "A";
    expect(inboxValidator.validate(i, other).correct).toBe(false);
    expect(insiderValidator.validate(s, other).correct).toBe(false);
  }
  setRound1CaseForTests(null);
}

describe("private Round 1 case parameters", () => {
  afterAll(() => setRound1CaseForTests(null));
  it("the built-in (public) tables still produce a consistent, solvable game", () => checkCase(BUILTIN_CASE));
  it("200 randomly generated private cases are each valid, consistent and solvable", () => {
    for (let n = 0; n < 200; n++) checkCase(parseRound1Case(generateRound1Case()));
  }, 120_000);
  it("generated cases differ from the public tables (answers are not derivable from the repository)", () => {
    const a = parseRound1Case(generateRound1Case());
    setRound1CaseForTests(a); const privateIds = [inboxSolution("A"), trailSolution("A"), insiderSolution("A"), containmentSolution("A")].map(json).join();
    setRound1CaseForTests(BUILTIN_CASE); const publicIds = [inboxSolution("A"), trailSolution("A"), insiderSolution("A"), containmentSolution("A")].map(json).join();
    setRound1CaseForTests(null);
    expect(privateIds).not.toBe(publicIds);
  });
  it("rejects malformed or unsafe files (fail closed)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed inputs
    const bad = (mutate: (k: any) => void) => { const k = structuredClone(BUILTIN_CASE) as any; mutate(k); return () => parseRound1Case(k); };
    expect(bad(k => { k.variants.A.insider.employee = 0; })).toThrow();          // the victim cannot be the accomplice
    expect(bad(k => { k.variants.A.insider.employee = 2; })).toThrow();          // no policy-write privilege
    expect(bad(k => { k.variants.A.inbox.entry = "alert"; })).toThrow();         // fixed decoy role
    expect(bad(k => { k.variants.A.containment.immediate[0] = "07"; })).toThrow(); // collides with a fixed decoy action
    expect(bad(k => { k.variants.B.trail.replay = k.variants.B.trail.mint; })).toThrow();
    expect(bad(k => { k.variants.C.inbox.session = "nx-a-123"; })).toThrow();
    expect(bad(k => { k.extra = 1; })).toThrow();
  });
  it("production refuses to serve the public tables when the private file is missing (fail closed)", async () => {
    vi.resetModules(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("GHOST_R1_CASE_FILE", "/nonexistent/round1-case.json");
    try { const m = await import("../src/lib/game/case-key.server"); expect(() => m.round1Case("A")).toThrow(/refusing to serve the public answer tables/); }
    finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it.skipIf(!existsSync("private/round1-case-v1.json"))("the INSTALLED private case file is valid and solvable", () => {
    checkCase(parseRound1Case(JSON.parse(readFileSync("private/round1-case-v1.json", "utf8"))));
  });
});
