import "server-only";
import { criterionPoints, MAX_ATTEMPTS_PER_TASK } from "./catalog";
import { fieldsFor } from "./forms.server";

// Scoring policies for Round 2 tasks. EXPERIMENTAL / DORMANT: the release default stays "union" (the behaviour all Phase 3-5 tests describe)
// until the organizer approves "best". See docs/phase6a-release-hardening.md (F3).
//   union: a task's score is the union of criteria earned by ANY submission. Incompatible guesses accumulate (farmable).
//   best : a task's score is the score of the single best coherent submission. A later submission replaces the stored criteria only when it
//          is worth strictly more, so the earned total never decreases and incompatible guesses never add up.
export type Policy = "union" | "best";
export type PolicyState = { earned: number; criteria: Set<string> };
export const emptyState = (): PolicyState => ({ earned: 0, criteria: new Set() });
const pointsOf = (criteria: Iterable<string>) => [...criteria].reduce((n, c) => n + (criterionPoints.get(c) ?? 0), 0);
export function scoreUnion(state: PolicyState, satisfied: Set<string>): PolicyState {
  const criteria = new Set([...state.criteria, ...satisfied]);
  return { earned: pointsOf(criteria), criteria };
}
export function scoreBest(state: PolicyState, satisfied: Set<string>): PolicyState {
  const earned = pointsOf(satisfied);
  return earned > state.earned ? { earned, criteria: new Set(satisfied) } : state;
}
export const scoringPolicy = (): Policy => (process.env.GHOST_R2_SCORING_POLICY === "best" ? "best" : "union");

const log2Choose = (n: number, k: number) => { let r = 0; for (let i = 0; i < k; i++) r += Math.log2((n - i) / (i + 1)); return r; };
/** log2 of the number of distinct valid answers a participant could submit for a task (a measure of how guessable it is). */
export function answerSpaceBits(taskId: string): number {
  return fieldsFor(taskId).reduce((bits, f) => {
    const n = f.options?.length ?? 0;
    if (f.kind === "single") return bits + Math.log2(Math.max(n, 1));
    if (f.kind === "order") return bits + Array.from({ length: n }, (_, i) => Math.log2(i + 1)).reduce((a, b) => a + b, 0);
    if (f.kind === "multi") { let total = 0; for (let k = 1; k <= Math.min(f.max ?? n, n); k++) total += 2 ** log2Choose(n, k); return bits + Math.log2(total || 1); }
    if (f.kind === "keyed") return bits + Math.log2(1 + (f.maxKeys ?? 1) * (f.keys?.length ?? 1) * 2 ** log2Choose(n, Math.min(f.max ?? 1, n)));
    return bits;
  }, 0);
}
/**
 * Graded attempts allowed per task. "union" keeps the legacy flat cap. "best" tiers the cap by how guessable the task is:
 * small closed-choice tasks (<= 2^8 possible answers) 3 attempts; medium (<= 2^20) 5; large 8. Identical re-submissions stay free.
 */
export function attemptCap(taskId: string, policy: Policy): number {
  if (policy === "union") return MAX_ATTEMPTS_PER_TASK;
  const bits = answerSpaceBits(taskId);
  return bits <= 8 ? 3 : bits <= 20 ? 5 : 8;
}
