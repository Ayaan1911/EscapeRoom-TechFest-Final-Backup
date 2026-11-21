// Round 2 (GHOST RETURNS) task catalog: ids, parts, titles and point values only. NEVER answers, so it is safe to import anywhere.
// A criterion id is `<taskId>:<key>`; graders (tasks.server.ts) return the criterion ids a submission satisfies.
export type R2Part = "A" | "B";
export type R2Task = { id: string; part: R2Part; unit: number; title: string; criteria: Record<string, number> };
const ones = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i + 1}`, 1]));
export const CONTENT_VERSION = "r2-v1";
export const UNITS: Record<R2Part, readonly string[]> = {
  A: ["Alert at 2:14 AM", "Kill Switch", "Audit the AI", "Executive Decision"],
  B: ["Reconstruct the Incident", "Challenge the Alternative", "Expose the False Intelligence", "Final Command Decision"],
};
export const r2Catalog: readonly R2Task[] = [
  // PART A: 4 incidents x 15 = 60
  { id: "i1.classify", part: "A", unit: 1, title: "Triage six observations", criteria: { o1: 1, o2: 1, o3: 1, o4: 1, o5: 1, o6: 1 } },
  { id: "i1.assets", part: "A", unit: 1, title: "Affected assets", criteria: { account: 1, device: 1, noExtra: 1 } },
  { id: "i1.response", part: "A", unit: 1, title: "Proportionate immediate response", criteria: { identity: 1, endpoint: 1, proportionate: 1 } },
  { id: "i1.justify", part: "A", unit: 1, title: "Independent corroboration", criteria: { sources: 1, corroborated: 1, precise: 1 } },
  { id: "i2.identify", part: "A", unit: 2, title: "Find the two malicious connections", criteria: { c3: 2, c8: 2, exact: 2 } },
  { id: "i2.evidence", part: "A", unit: 2, title: "Prove each connection", criteria: { c3a: 1, c3b: 1, c8a: 1, c8b: 1, precise: 1 } },
  { id: "i2.block", part: "A", unit: 2, title: "Simulated BLOCK actions", criteria: { b3: 1, b8: 1, noCollateral: 2 } },
  { id: "i3.verdicts", part: "A", unit: 3, title: "Judge the three claims", criteria: { a: 1, b: 1, c: 1 } },
  { id: "i3.contradictions", part: "A", unit: 3, title: "Cite the contradicting sources", criteria: { a1: 1, a2: 1, aClean: 1, c1: 1, c2: 1, cClean: 1 } },
  { id: "i3.corrections", part: "A", unit: 3, title: "Corrected interpretations", criteria: { a: 3, c: 3 } },
  { id: "i4.contain", part: "A", unit: 4, title: "Immediate containment", criteria: { hold: 1, proportion: 1 } },
  { id: "i4.preserve", part: "A", unit: 4, title: "Evidence preservation", criteria: { volatile: 1, logs: 1, nodestroy: 1 } },
  { id: "i4.comms", part: "A", unit: 4, title: "Stakeholder communication", criteria: { exec: 1, staff: 1, external: 1 } },
  { id: "i4.prereq", part: "A", unit: 4, title: "Recovery prerequisites", criteria: { required: 1, precise: 1 } },
  { id: "i4.sequence", part: "A", unit: 4, title: "Restoration sequence", criteria: ones(5) },
  // PART B: 4 challenges x 10 = 40
  { id: "b1.chain", part: "B", unit: 1, title: "Select the causal chain", criteria: { complete: 1, clean: 1 } },
  { id: "b1.order", part: "B", unit: 1, title: "Normalize clocks and order events", criteria: ones(5) },
  { id: "b1.root", part: "B", unit: 1, title: "Root cause, first action, dwell time", criteria: { vector: 1, dwell: 1, firstAction: 1 } },
  { id: "b2.best", part: "B", unit: 2, title: "The explanation the evidence supports", criteria: { best: 2, support: 1, supportClean: 1 } },
  { id: "b2.eliminate", part: "B", unit: 2, title: "Eliminate the alternatives", criteria: { h1a: 1, h1b: 1, h2a: 1, h2b: 1, h3a: 1, h3b: 1 } },
  { id: "b3.classify", part: "B", unit: 3, title: "Grade the intelligence bulletin", criteria: { i1: 1, i2: 1, i3: 1, i4: 1, i5: 1, i6: 1 } },
  { id: "b3.verify", part: "B", unit: 3, title: "Independent verification", criteria: { i1: 1, i2: 1, i4: 1, i5: 1 } },
  { id: "b4.facts", part: "B", unit: 4, title: "Confirmed incident facts", criteria: { core: 1, complete: 1, clean: 1 } },
  { id: "b4.attribution", part: "B", unit: 4, title: "Attribution limitations", criteria: { level: 1, reasons: 1 } },
  { id: "b4.plan", part: "B", unit: 4, title: "Containment, preservation, recovery", criteria: { containment: 1, preservation: 1, recovery: 1 } },
  { id: "b4.comms", part: "B", unit: 4, title: "Communication decisions", criteria: { regulator: 1, suppliers: 1 } },
];
export const taskMax = (t: R2Task) => Object.values(t.criteria).reduce((a, b) => a + b, 0);
export const r2TaskById = new Map(r2Catalog.map(t => [t.id, t]));
export const criterionPoints = new Map<string, number>(r2Catalog.flatMap(t => Object.entries(t.criteria).map(([key, v]) => [`${t.id}:${key}`, v] as const)));
export const partMax = (part: R2Part) => r2Catalog.filter(t => t.part === part).reduce((n, t) => n + taskMax(t), 0);
export const unitMax = (part: R2Part, unit: number) => r2Catalog.filter(t => t.part === part && t.unit === unit).reduce((n, t) => n + taskMax(t), 0);
export const MAX_ATTEMPTS_PER_TASK = 12; // graded attempts; identical re-submissions are free and idempotent
export const MIN_SUBMIT_GAP_MS = 3000;

/**
 * FROZEN for this event (organizer-approved): the five difficult investigation tasks whose combined earned points are the FOURTH ranking tiebreaker.
 * It is a tiebreaker only and never adds to a score. Not configurable at runtime; changing it requires a code change and review.
 */
export const DIFFICULT_TASKS = ["i1.justify", "i2.evidence", "i3.contradictions", "b1.chain", "b2.eliminate"] as const;
export const DIFFICULTY_MAX = DIFFICULT_TASKS.reduce((n, id) => n + (r2TaskById.get(id) ? taskMax(r2TaskById.get(id)!) : 0), 0); // 3 + 5 + 6 + 2 + 6 = 22
