# Final game build (Phase 6B-1): tiebreakers, exact-tie acknowledgment, polish

Branch `feat/final-game-build` from `0323c03`. Disposable PostgreSQL and synthetic teams only. Scoring totals, best-v1, the 2/3/5 attempt tiers, R1 max 105, R2 max 100, the 50% unlock thresholds, the R2 timer/release schedule and the per-team transaction locking are all unchanged.

## Final Round 2 ranking (server-side only)
`src/lib/round2/ranking.ts` (`rankR2`) is the ONLY place results are sorted. Organizer results, the CSV and the published participant results all call it; the UI never sorts. Criteria in exactly this order:
1. higher total score (of 100)
2. higher Part B / Digital Tribunal score
3. faster Part A completion (server time of the last Part A submission that earned new points; existing definition)
4. higher difficulty subtotal
5. equal on all four: the teams share the rank (`tie: true`); display order inside a shared rank is by team id for stability only.

**Difficulty subtotal** = points earned on the five frozen tasks `i1.justify` (3), `i2.evidence` (5), `i3.contradictions` (6), `b1.chain` (2), `b2.eliminate` (6): maximum 22. The list is the constant `DIFFICULT_TASKS` in `src/lib/round2/catalog.ts`: not configurable at runtime, not editable in any organizer screen, not derived from participant performance. It is a tiebreaker only: it is never added to `partA`, `partB` or `total` (tested). Because tasks use best-v1, the subtotal is the sum of the stored best score of those five tasks.

## Exact-tie acknowledgment
- Additive migration `20261123000000_tie_acknowledgment`: one append-only table `R2TieAck` (rank, team ids, signature, reason, decidedBy, createdAt; `signature` UNIQUE so a tie group can be acknowledged once, database-enforced). Equal to Prisma's generated diff.
- `acknowledgeTie({rank, reason})` (organizer session required, same-origin POST `action: "acknowledge-tie"`): round must be finished and results not yet published; reason 10 to 500 characters; the rank must currently be an exact tie; writes the record plus an organizer audit entry. It changes no score, rank or order and has no way to select a winner.
- `publishResults` refuses (409, lists the unacknowledged ranks) while any exact tie is unacknowledged; with no exact tie nothing extra is needed. The publish audit entry records how many ties were acknowledged.
- Organizer UI: results table with a Difficulty column, a tiebreak-order note, an "Exact ties" panel (reason box, per-tie "Acknowledge exact tie" button with a confirmation dialog that says it cannot select a winner), the Publish button disabled with an explanation until all ties are acknowledged.
- Results/CSV: the CSV has `Exact tie (shared rank)`, `Tie acknowledgment reason`, `Tie acknowledged by/at` and `Difficulty subtotal (of 22)` columns. Participants see shared ranks ("shared rank, exact tie acknowledged") and the difficulty column after publication.
- Participant rule shown BEFORE the round: the waiting room now lists the tie order, the five difficult tasks and that the subtotal adds no points, plus the best-submission/attempt rule.

## Malformed payloads no longer exhaust attempts (legacy full-chapter route and task route)
Under best-v1 a payload that fails its schema (task schema or the chapter validator's new `valid()`) is refused with `Invalid answer format. No attempt was used.` BEFORE any attempt is spent, in both request formats; the refusal is audited but is not a graded attempt. A well-formed but wrong answer still costs exactly one attempt per eligible task. Anti-farming protections are unchanged (tests: counters stay `[0,0,0]` after malformed task and chapter payloads, then `[0,0,1]` and `[1,1,2]` after valid wrong guesses). Side effect: payloads with extra/forged fields are refused for free instead of being graded as zero. The legacy load-test harness's "wrong" answers are malformed, so they now show HTTP 409 instead of 200.

## UI polish
- Round 1 Containment on phones: every task starts collapsed (task navigator chips and Open buttons reveal them); full-page height 5,072 px to 2,476 px; evidence and all five tasks remain one tap away.
- Round 2 Kill Switch: edge labels removed from the SVG; each connection id now sits under the nodes it touches and the details panel names the selected connection.
- Tablet top bar: wrapping flex row, no empty grid cells.

## Verification
See the final report. Browser suites: R2 lifecycle (16), R1 phase2 suites under best-v1 (15) and legacy (15 earlier), R1 attempt counters tiers A/B/C (3), fast organizer tie spec (1), visual (3).
