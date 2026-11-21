import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { criterionPoints, r2Catalog, taskMax } from "../src/lib/round2/catalog";
import { fieldsFor } from "../src/lib/round2/forms.server";
import { buildAnswer, setAt, type Answer, type Field } from "../src/lib/round2/form-types";
import { gradeValidated, validateAnswer } from "../src/lib/round2/tasks.server";
import { attemptCap, scoreUnion, scoreBest, emptyState } from "../src/lib/round2/scoring-policy";
import { taskDefs } from "../src/lib/game/validators";
import { gradeTask, criterionPoints as r1Points } from "../src/lib/game/scoring";
import { containmentEvidence } from "../src/lib/game/containment.server";

// F3: score farming. Pure and deterministic (seeded PRNG); no database. Section 1 reproduces the exploit exactly, section 2 measures how
// much of each task a guessing attacker can farm under the CURRENT union policy versus the PROPOSED best-coherent policy, section 3 covers Round 1.
const points = (taskId: string, answer: unknown) => { const v = validateAnswer(taskId, answer); return v.ok ? new Set(gradeValidated(taskId, v.data)) : null; };
const earnedOf = (set: Set<string>) => [...set].reduce((n, c) => n + (criterionPoints.get(c) ?? 0), 0);

describe("F3 section 1: the union policy lets a team farm full credit from incompatible guesses (R2, exact reproduction)", () => {
  const union = (taskId: string, answers: Answer[]) => { const s = new Set<string>(); for (const a of answers) for (const c of points(taskId, a) ?? []) s.add(c); return earnedOf(s); };
  const keys = ["E-101", "E-102", "E-103", "E-107", "E-108", "E-110"];
  it("i1.classify: 3 constant submissions (all benign / all suspicious / all compromise) earn 6/6 without reading a record", () => {
    const answers = ["benign", "suspicious", "compromise"].map(c => ({ classifications: Object.fromEntries(keys.map(k => [k, c])) }));
    expect(union("i1.classify", answers.slice(0, 1))).toBe(2); expect(union("i1.classify", answers.slice(0, 2))).toBe(4); expect(union("i1.classify", answers)).toBe(6);
    for (const a of answers) expect(earnedOf(points("i1.classify", a)!)).toBeLessThanOrEqual(2); // each single submission is worth at most 2
  });
  it("i3.verdicts: 2 submissions (all true, all false) earn 3/3", () => {
    const t = { verdicts: { A: "true", B: "true", C: "true" } }, f = { verdicts: { A: "false", B: "false", C: "false" } };
    expect(earnedOf(points("i3.verdicts", t)!)).toBe(1); expect(earnedOf(points("i3.verdicts", f)!)).toBe(2); expect(union("i3.verdicts", [t, f])).toBe(3);
  });
  it("b3.classify: 3 constant submissions earn 6/6", () => {
    const keys6 = ["INT-1", "INT-2", "INT-3", "INT-4", "INT-5", "INT-6"], a = ["accurate", "false", "unverifiable"].map(g => ({ grades: Object.fromEntries(keys6.map(k => [k, g])) }));
    expect(Math.max(...a.map(x => earnedOf(points("b3.classify", x)!)))).toBeLessThanOrEqual(3); expect(union("b3.classify", a)).toBe(6);
  });
  it("b4.plan and b4.attribution level: one option sweep (3 attempts) earns the full task", () => {
    const plan = [1, 2, 3].map(i => ({ containment: `pc-${i}`, preservation: `pp-${i}`, recovery: `pr-${i}` }));
    expect(union("b4.plan", plan)).toBe(3); expect(Math.max(...plan.map(p => earnedOf(points("b4.plan", p)!)))).toBe(1);
  });
  it("i4.comms: a 3x3 sweep over (vendor, public) plus one sweep for the others farms 3/3 in at most 9 attempts", () => {
    const ex = ["mx-1", "mx-2", "mx-3"], st = ["ms-1", "ms-2", "ms-3"], vn = ["mv-1", "mv-2", "mv-3"], pb = ["mp-1", "mp-2", "mp-3"];
    const all: Answer[] = []; let n = 0, got = 0;
    for (let k = 0; k < 3 && got < 3; k++) for (let j = 0; j < 3 && got < 3; j++) { all.push({ choices: { executives: ex[k], staff: st[k], vendor: vn[j], public: pb[(j + k) % 3] } }); n++; got = union("i4.comms", all); }
    expect(got).toBe(3); expect(n).toBeLessThanOrEqual(9);
  });
  it("the current 12-attempt cap does not prevent it for any of those tasks (all need 9 attempts or fewer)", () => { expect(attemptCap("i1.classify", "union")).toBe(12); });
});

// ---- section 2: Monte Carlo over EVERY task using the real graders ----
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomValue(f: Field, r: () => number): unknown {
  const opts = f.options ?? [], pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  if (f.kind === "single") return pick(opts).id;
  if (f.kind === "text") return undefined;
  if (f.kind === "order") return opts.map(o => o.id).sort(() => r() - 0.5);
  if (f.kind === "multi") { const n = 1 + Math.floor(r() * Math.min(f.max ?? 99, opts.length)); return opts.map(o => o.id).sort(() => r() - 0.5).slice(0, n); }
  const nk = 1 + Math.floor(r() * (f.maxKeys ?? 2)), ks = (f.keys ?? []).map(k => k.id).sort(() => r() - 0.5).slice(0, nk);
  return Object.fromEntries(ks.map(k => [k, opts.map(o => o.id).sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * (f.max ?? 4)))]));
}
const randomAnswer = (fields: Field[], r: () => number): Answer => { let a: Answer = {}; for (const f of fields) { const v = randomValue(f, r); if (v !== undefined) a = setAt(a, f.path, v); } return buildAnswer(fields, a); };
const mutate = (fields: Field[], base: Answer, r: () => number): Answer => { const cand = fields.filter(f => f.kind !== "text"), f = cand[Math.floor(r() * cand.length)]; return buildAnswer(fields, setAt(base, f.path, randomValue(f, r))); };
type Policy = { name: string; semantic: "union" | "best"; cap: (taskId: string) => number };
const POLICIES: Policy[] = [{ name: "CURRENT union, cap 12", semantic: "union", cap: () => 12 }, { name: "best-coherent, cap 12", semantic: "best", cap: () => 12 }, { name: "best-coherent, tiered cap", semantic: "best", cap: id => attemptCap(id, "best") }, { name: "best-coherent, cap 2", semantic: "best", cap: () => 2 }, { name: "best-coherent, cap 3", semantic: "best", cap: () => 3 }, { name: "CHANCE FLOOR: one coherent attempt", semantic: "best", cap: () => 1 }];

/** One attacker run: hill-climbing guesser that sees only the points-awarded delta of each submission. Returns the fraction of the task's maximum it holds. */
function attack(taskId: string, policy: Policy, seed: number, attempts: number, adaptive: boolean) {
  const fields = fieldsFor(taskId), r = rng(seed), cap = Math.min(attempts, policy.cap(taskId)), max = taskMax(r2Catalog.find(t => t.id === taskId)!);
  let st = emptyState(), cur = randomAnswer(fields, r), anchor = cur;
  for (let i = 0; i < cap; i++) {
    const set = points(taskId, cur); if (!set) { cur = randomAnswer(fields, r); continue; }
    const before = st.earned; st = policy.semantic === "union" ? scoreUnion(st, set) : scoreBest(st, set);
    if (adaptive) { if (st.earned > before) anchor = cur; cur = mutate(fields, anchor, r); } else cur = randomAnswer(fields, r);
  }
  return st.earned / max;
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("F3 section 2: guessing attackers vs. scoring policies (all 26 R2 tasks, real graders)", () => {
  const N = 150, rows: Record<string, unknown>[] = [];
  const result = new Map<string, Record<string, number>>();
  for (const t of r2Catalog) {
    const out: Record<string, number> = {};
    for (const p of POLICIES) for (const adaptive of [false, true]) out[`${p.name} | ${adaptive ? "adaptive" : "random"}`] = mean(Array.from({ length: N }, (_, i) => attack(t.id, p, 1000 + i, 12, adaptive)));
    result.set(t.id, out);
  }
  it("measures and records the farmed fraction per task and policy", () => {
    for (const t of r2Catalog) rows.push({ task: t.id, part: t.part, max: taskMax(t), cap: attemptCap(t.id, "best"), ...Object.fromEntries(Object.entries(result.get(t.id)!).map(([k, v]) => [k, Math.round(v * 100)])) });
    mkdirSync("test-results/f3", { recursive: true }); writeFileSync("test-results/f3/farming.json", JSON.stringify(rows, null, 1));
    const agg = (key: string, w?: (t: (typeof r2Catalog)[number]) => boolean) => { const ts = r2Catalog.filter(t => !w || w(t)); const tot = ts.reduce((n, t) => n + taskMax(t), 0); return Math.round(100 * ts.reduce((n, t) => n + result.get(t.id)![key] * taskMax(t), 0) / tot); };
    const summary = Object.fromEntries(POLICIES.flatMap(p => ["random", "adaptive"].map(m => [`${p.name} | ${m}`, agg(`${p.name} | ${m}`)])));
    writeFileSync("test-results/f3/summary.json", JSON.stringify(summary, null, 1)); console.log("F3 weighted % of ALL R2 points farmed by a blind guesser:", JSON.stringify(summary));
    expect(rows).toHaveLength(26);
  });
  it("best-coherent scoring strictly reduces what an adaptive blind guesser can farm, and tiered caps reduce it further", () => {
    const a = (k: string) => mean(r2Catalog.map(t => result.get(t.id)![k] * taskMax(t)));
    expect(a("best-coherent, cap 12 | adaptive")).toBeLessThan(a("CURRENT union, cap 12 | adaptive"));
    expect(a("best-coherent, tiered cap | adaptive")).toBeLessThanOrEqual(a("best-coherent, cap 12 | adaptive"));
    expect(a("best-coherent, tiered cap | random")).toBeLessThan(a("CURRENT union, cap 12 | random"));
  });
  it("under the current policy even a blind guesser farms the majority of the small closed-choice tasks", () => {
    for (const id of ["i3.verdicts", "b3.classify", "b4.plan"]) expect(result.get(id)!["CURRENT union, cap 12 | adaptive"], id).toBeGreaterThan(0.5); // a blind hill-climber is a LOWER bound; section 1 shows the optimal attacker reaches 100%
  });
});

describe("F3 section 3: Round 1 (union, 60 scored attempts per chapter)", () => {
  it("containment.immediate: submitting each option on its own earns every correct action (full 4/4) within the option count", () => {
    const options = containmentEvidence("A").immediateOptions.map(o => o.id);
    const earned = new Set<string>(); let attempts = 0;
    for (const id of options) { attempts++; for (const c of gradeTask(taskDefs[3], "containment.immediate", { immediateActions: [id] }, "A")) earned.add(c); if (earned.size === 4) break; }
    const total = [...earned].reduce((n, c) => n + (r1Points.get(c) ?? 0), 0);
    expect(total).toBe(4); expect(attempts).toBeLessThanOrEqual(options.length); expect(attempts).toBeLessThan(60); // far below the 60-attempt chapter cap
    // ...whereas a single coherent submission of one option is worth 1
    expect(gradeTask(taskDefs[3], "containment.immediate", { immediateActions: [options[0]] }, "A").length).toBeLessThanOrEqual(1);
  });
});
