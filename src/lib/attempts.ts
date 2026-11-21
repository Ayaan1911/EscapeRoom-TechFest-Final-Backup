// Approved attempt policy ("best-v1"): ONE module for both rounds. Client-safe: ids, tiers and reasons only, never answers.
// Score rule (both rounds): a task's score is the score of its single best coherent submission; a later submission replaces it only when strictly
// better, so earned points never decrease and incompatible guesses never combine. Caps count DISTINCT graded attempts; an identical re-submission is
// free. Tiers were assigned task by task (guess probability, number of independent judgments, evidence complexity, partial-credit structure, how fairly a
// mistake can be corrected), not from answer-space size alone.
export type Tier = "A" | "B" | "C" | "X";
export const TIER_CAP: Record<Tier, number> = { A: 2, B: 3, C: 5, X: 8 };
export const POLICY_BEST = "best-v1", POLICY_LEGACY = "union-v0";
export type TaskTier = { tier: Tier; why: string };
const t = (tier: Tier, why: string): TaskTier => ({ tier, why });

export const taskTiers: Record<string, TaskTier> = {
  // ---- Round 1 ----
  "inbox.entry": t("B", "three independent record picks from short candidate lists; first chapter, early slips should be correctable"),
  "inbox.identity": t("B", "two record picks (authentication event, session); ordinary evidence lookup"),
  "inbox.impact": t("A", "one pick among a handful of database records; a single judgment is trivially guessable"),
  "trail.source": t("B", "two typed values (account, source IP) read from logs; typos are possible but the space is not guessable"),
  "trail.session": t("B", "two typed identifiers from the log trail"),
  "trail.corroboration": t("C", "choose supporting records from a large evidence list; evidence correlation"),
  "insider.suspect": t("A", "one pick among a small suspect grid; second try covers a misreading, more would let the grid be walked"),
  "insider.action": t("A", "one pick among a few policy records"),
  "insider.corroboration": t("C", "intent, access and approval evidence from many records; evidence correlation"),
  "containment.timeline": t("B", "ordering seven events; pair-structured partial credit is cheap to probe"),
  "containment.identity": t("B", "two typed values carried from earlier chapters"),
  "containment.immediate": t("B", "choose scoped urgent actions among ~10 options; demonstrated farmable one option at a time under the old rule"),
  "containment.recovery": t("B", "select and order six recovery steps; ordered-pair credit is cheap to probe"),
  "containment.evidence": t("C", "pin supporting records among many artifacts; evidence correlation"),
  "verdict.entry": t("B", "three record picks recapping the entry chain"),
  "verdict.session": t("B", "three values recapping the session and impact chain"),
  "verdict.insider": t("B", "two picks recapping the insider chain"),
  "verdict.evidence": t("C", "map evidence to five roles; multi-record reasoning"),
  "verdict.reasoning": t("A", "hypothesis plus rejection choice from tiny closed sets"),
  // ---- Round 2 Part A ----
  "i1.classify": t("A", "six 3-way labels; classification, each judgment 1-in-3 and cheap to cycle"),
  "i1.assets": t("B", "subset of six assets with an over-selection rule"),
  "i1.response": t("B", "subset of eight response actions with proportionality rules"),
  "i1.justify": t("C", "pick 3-5 of 14 records that corroborate across independent sources"),
  "i2.identify": t("B", "two malicious of ten connections; the three-selection rule makes probing costly but the oracle is strong"),
  "i2.evidence": t("C", "map proof records onto two connections from ten records"),
  "i2.block": t("B", "simulated blocks with a collateral-damage rule"),
  "i3.verdicts": t("A", "three binary judgments"),
  "i3.contradictions": t("C", "cite contradicting primary records for two claims from nine records"),
  "i3.corrections": t("A", "two 4-way closed choices"),
  "i4.contain": t("A", "five-option containment decisions, short closed-choice"),
  "i4.preserve": t("B", "seven preservation items with destructive traps"),
  "i4.comms": t("B", "four independent 3-way audience decisions (81 combinations)"),
  "i4.prereq": t("B", "six prerequisite statements with false conditions"),
  "i4.sequence": t("B", "order six steps; five dependency pairs are each a coin flip and cheap to probe"),
  // ---- Round 2 Part B ----
  "b1.chain": t("C", "classify eleven events into causal chain or decoys; incident reconstruction"),
  "b1.order": t("B", "order eleven events across skewed clocks; five pair criteria are cheap to probe, so the cap stays at three"),
  "b1.root": t("A", "three closed choices (vector, first action, dwell)"),
  "b2.best": t("B", "pick a hypothesis plus 2-4 supporting records"),
  "b2.eliminate": t("C", "refute three hypotheses with records from a twelve-record pool"),
  "b3.classify": t("A", "six 3-way grades; classification"),
  "b3.verify": t("B", "choose which items to refute and the refuting record, plus one 4-way limitation"),
  "b4.facts": t("B", "ten statements judged confirmed or not; three overlapping criteria"),
  "b4.attribution": t("A", "one 4-way level plus a small reason set"),
  "b4.plan": t("A", "three 3-way decisions"),
  "b4.comms": t("A", "two 3-way notification decisions"),
};
export const attemptCap = (taskId: string): number => TIER_CAP[(taskTiers[taskId] ?? { tier: "A" }).tier]; // unknown tasks fail closed to the strictest cap
export type Attempts = { used: number; cap: number; remaining: number };
export const attemptsOf = (taskId: string, used: number): Attempts => { const cap = attemptCap(taskId); return { used, cap, remaining: Math.max(0, cap - used) }; };
