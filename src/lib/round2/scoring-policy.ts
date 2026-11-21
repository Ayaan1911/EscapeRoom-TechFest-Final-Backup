import "server-only";
import { criterionPoints } from "./catalog";
import { fieldsFor } from "./forms.server";
import { attemptCap as tierCap, POLICY_BEST, POLICY_LEGACY } from "@/lib/attempts";

// Round 2 task scoring policies. The policy is FIXED PER SESSION: startRound persists it on R2Session and every submission reads it from the row,
// never from the environment, so a restart or a config change cannot alter scoring mid-round.
//   best-v1  (approved default for every new session): a task's score is the score of its single best coherent submission. A later submission replaces
//            the stored criteria only when strictly better, so earned never decreases and incompatible guesses never combine. Tiered attempt caps.
//   union-v0 (legacy; sessions started before policies existed, NULL in the database): criteria from any submission accumulate; flat 12-attempt cap.
export type Policy = typeof POLICY_BEST | typeof POLICY_LEGACY;
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
/** The policy a stored session runs under. NULL (pre-policy session) is legacy, never silently upgraded. */
export const policyOfSession = (row: { scoringPolicy?: string | null }): Policy => (row.scoringPolicy === POLICY_BEST ? POLICY_BEST : POLICY_LEGACY);
export const LEGACY_CAP = 12;
export const capFor = (taskId: string, policy: Policy) => (policy === POLICY_BEST ? tierCap(taskId) : LEGACY_CAP);

const log2Choose = (n: number, k: number) => { let r = 0; for (let i = 0; i < k; i++) r += Math.log2((n - i) / (i + 1)); return r; };
/** log2 of the number of distinct valid answers (informational: how guessable a task is; NOT used to pick caps). */
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
