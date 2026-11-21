# Phase 6A finalization: approved scoring policy "best-v1"

Branch `feat/phase6a-scoring-finalization` from `cd9cfa8`. Disposable PostgreSQL and synthetic teams only; nothing hosted was touched.

## The rule (both rounds)
For each task the stored score is **max(previous best, score of this single coherent submission)**. The criteria stored for the task are those of the best submission, never a union. A worse answer changes nothing (but a new, distinct one uses an attempt); a better answer awards only the improvement and replaces the stored criteria; an identical re-submission is idempotent and free. Totals never decrease; task, chapter and round maxima are unchanged (R1 105 incl. the one-time 5-point Tamper bonus, R2 100 = 60 + 40).

## Where it lives
- `src/lib/attempts.ts`: the single, client-safe source of truth for tiers, caps and reasons (both rounds). Tier A = 2, B = 3, C = 5 attempts; the exception tier (8) is unused because no task justified it.
- Round 1: `mutateTeam` in `src/lib/game/service.ts` (best-v1 branch beside the untouched legacy branch). Round 2: `submitTask` in `src/lib/round2/play.server.ts` + `scoring-policy.ts`.
- Request formats: Round 1 task submissions and legacy full-chapter submissions share ONE per-task attempt counter (`TaskScore.attempts`). A chapter submission is an attempt for every task of the chapter that is neither complete nor exhausted; if none is eligible it is refused. An identical payload (hash) is free in either format. A pure Tamper Alert probe (`{kind:"tamper"}`) is not an answer and consumes no attempt (the one-time bonus rule is unchanged).

## Historical compatibility and immutability
- Additive migration `20261122000000_scoring_policy`: nullable `GameSession.scoringPolicy`, `R2Session.scoringPolicy`, `R2Submission.scoringPolicy`; `Submission.taskId`, `Submission.answerHash` (+ index); `TaskScore.attempts INT DEFAULT 0`. Equal to Prisma's generated diff; the migration smoke (13 checks) proves a pre-policy database keeps every pre-existing column of every row byte-identical, the already-started round keeps `scoringPolicy = NULL`, and historic rows get `attempts = 0`.
- NULL policy on a **started** round = legacy `union-v0`; it is never silently upgraded and keeps the flat legacy caps (R1 60 per chapter, R2 12 per task). A round that has **not started** reports best-v1 and gets it written when `control("start")` / `startRound()` runs. Both start paths record the policy in the audit log; R2 submissions also store `scoringPolicy` per row and R1 best-v1 rows use `scoringVersion = 3` with `taskId` and `answerHash`.
- The policy is read from the stored round row on every submission, never from the environment. Tests prove an environment variable and a module restart cannot change it, and a second start is refused. The old `GHOST_R2_SCORING_POLICY` switch no longer exists.

## Server API
`GET /api/game` (R1) now returns `policy` and, per task, `attempts: {used, cap, remaining}` (`null` on legacy rounds); submit results add `duplicate`, `improved`, and per-task `attempts`. `GET /api/round2/status` returns `policy` and `attempts` per task; the submit response adds `improved`, `policy`, `attempts`; exhausted tasks answer 429 `No attempts remaining. Your highest score has been saved.` (R1: 409 error with the same text). Counts come only from the server.

## Participant UI
Round 1 `TaskPanel` and Round 2 `TaskCard` show `Attempts used/cap`, "Your highest-scoring submission counts." and the remaining count, a disabled "No attempts remaining" button, and the specified messages ("New personal best: +N points.", "No improvement. Your previous best score has been retained.", "No attempts remaining. Your highest score has been saved."; the first zero-point attempt says "No points yet. Your highest-scoring submission counts."). Legacy rounds keep their old wording.

## Per-task attempt matrix (both rounds)
(node:27160) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///D:/Projects/EscapeRoom%20TechFest/src/lib/attempts.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to D:\Projects\EscapeRoom TechFest\package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
| Round | Unit | Task | Pts | Tier | Cap | Reasoning |
|---|---|---|---|---|---|---|
| R1 | Inbox | inbox.entry | 6 | B | 3 | three independent record picks from short candidate lists; first chapter, early slips should be correctable |
| R1 | Inbox | inbox.identity | 6 | B | 3 | two record picks (authentication event, session); ordinary evidence lookup |
| R1 | Inbox | inbox.impact | 3 | A | 2 | one pick among a handful of database records; a single judgment is trivially guessable |
| R1 | Trail | trail.source | 8 | B | 3 | two typed values (account, source IP) read from logs; typos are possible but the space is not guessable |
| R1 | Trail | trail.session | 10 | B | 3 | two typed identifiers from the log trail |
| R1 | Trail | trail.corroboration | 7 | C | 5 | choose supporting records from a large evidence list; evidence correlation |
| R1 | Insider | insider.suspect | 8 | A | 2 | one pick among a small suspect grid; second try covers a misreading, more would let the grid be walked |
| R1 | Insider | insider.action | 7 | A | 2 | one pick among a few policy records |
| R1 | Insider | insider.corroboration | 10 | C | 5 | intent, access and approval evidence from many records; evidence correlation |
| R1 | Containment | containment.timeline | 6 | B | 3 | ordering seven events; pair-structured partial credit is cheap to probe |
| R1 | Containment | containment.identity | 2 | B | 3 | two typed values carried from earlier chapters |
| R1 | Containment | containment.immediate | 4 | B | 3 | choose scoped urgent actions among ~10 options; demonstrated farmable one option at a time under the old rule |
| R1 | Containment | containment.recovery | 6 | B | 3 | select and order six recovery steps; ordered-pair credit is cheap to probe |
| R1 | Containment | containment.evidence | 2 | C | 5 | pin supporting records among many artifacts; evidence correlation |
| R1 | Final Verdict | verdict.entry | 3 | B | 3 | three record picks recapping the entry chain |
| R1 | Final Verdict | verdict.session | 3 | B | 3 | three values recapping the session and impact chain |
| R1 | Final Verdict | verdict.insider | 2 | B | 3 | two picks recapping the insider chain |
| R1 | Final Verdict | verdict.evidence | 5 | C | 5 | map evidence to five roles; multi-record reasoning |
| R1 | Final Verdict | verdict.reasoning | 2 | A | 2 | hypothesis plus rejection choice from tiny closed sets |
| R2 | A1 | i1.classify | 6 | A | 2 | six 3-way labels; classification, each judgment 1-in-3 and cheap to cycle |
| R2 | A1 | i1.assets | 3 | B | 3 | subset of six assets with an over-selection rule |
| R2 | A1 | i1.response | 3 | B | 3 | subset of eight response actions with proportionality rules |
| R2 | A1 | i1.justify | 3 | C | 5 | pick 3-5 of 14 records that corroborate across independent sources |
| R2 | A2 | i2.identify | 6 | B | 3 | two malicious of ten connections; the three-selection rule makes probing costly but the oracle is strong |
| R2 | A2 | i2.evidence | 5 | C | 5 | map proof records onto two connections from ten records |
| R2 | A2 | i2.block | 4 | B | 3 | simulated blocks with a collateral-damage rule |
| R2 | A3 | i3.verdicts | 3 | A | 2 | three binary judgments |
| R2 | A3 | i3.contradictions | 6 | C | 5 | cite contradicting primary records for two claims from nine records |
| R2 | A3 | i3.corrections | 6 | A | 2 | two 4-way closed choices |
| R2 | A4 | i4.contain | 2 | A | 2 | five-option containment decisions, short closed-choice |
| R2 | A4 | i4.preserve | 3 | B | 3 | seven preservation items with destructive traps |
| R2 | A4 | i4.comms | 3 | B | 3 | four independent 3-way audience decisions (81 combinations) |
| R2 | A4 | i4.prereq | 2 | B | 3 | six prerequisite statements with false conditions |
| R2 | A4 | i4.sequence | 5 | B | 3 | order six steps; five dependency pairs are each a coin flip and cheap to probe |
| R2 | B1 | b1.chain | 2 | C | 5 | classify eleven events into causal chain or decoys; incident reconstruction |
| R2 | B1 | b1.order | 5 | B | 3 | order eleven events across skewed clocks; five pair criteria are cheap to probe, so the cap stays at three |
| R2 | B1 | b1.root | 3 | A | 2 | three closed choices (vector, first action, dwell) |
| R2 | B2 | b2.best | 4 | B | 3 | pick a hypothesis plus 2-4 supporting records |
| R2 | B2 | b2.eliminate | 6 | C | 5 | refute three hypotheses with records from a twelve-record pool |
| R2 | B3 | b3.classify | 6 | A | 2 | six 3-way grades; classification |
| R2 | B3 | b3.verify | 4 | B | 3 | choose which items to refute and the refuting record, plus one 4-way limitation |
| R2 | B4 | b4.facts | 3 | B | 3 | ten statements judged confirmed or not; three overlapping criteria |
| R2 | B4 | b4.attribution | 2 | A | 2 | one 4-way level plus a small reason set |
| R2 | B4 | b4.plan | 3 | A | 2 | three 3-way decisions |
| R2 | B4 | b4.comms | 2 | A | 2 | two 3-way notification decisions |

Counts R1 A/B/C: 4/11/4; R2 A/B/C: 9/12/5; exception tier (8): 0

Tier A = 2 attempts (easy to guess), B = 3, C = 5. No task earned the 8-attempt exception. Regenerate with `node scripts/attempt-matrix.mjs`; the matrix is enforced by tests (every task of both rounds must be present).

## Anti-farming evidence
Legacy behaviour reproduced first (round with `scoringPolicy` NULL), then closed:
- R2 `i1.classify`: 3 constant submissions = 6/6 (legacy); best-v1 = 2/6 and a third distinct attempt is refused (tier A cap 2). `i3.verdicts`: 3/3 in two attempts (legacy) vs 2/3 (best-v1).
- R1 `containment.immediate`: one option at a time reaches 4/4 (legacy); best-v1 = at most 1/4 and the fourth distinct attempt is refused (tier B cap 3).
- **Every task of both rounds** (R1 19 tasks, R2 26 tasks): the stored score equals the best single submission, the stored criteria are exactly that submission's, the cap holds, attempts never exceed the cap (`tests/scoring-best-v1-db.test.ts`, `tests/round2-policy-db.test.ts`, real service on PostgreSQL).
- Both request formats share counters (R1 chapter vs task submissions); identical payloads are free; concurrent submissions at the boundary are admitted one at a time (per-team lock + 3 s gap); refresh/re-login/restart/env change cannot alter policy or counters (counters live in the database).

Blind guessing over all 26 R2 tasks (150 seeded runs each, real graders, share of ALL R2 points a guesser who reads no evidence ends with; `tests/f3-score-farming.test.ts`):

| Policy | random | hill-climbing |
|---|---|---|
| Legacy union-v0, cap 12 | 78% | 68% |
| **Approved best-v1, tiers 2/3/5** | **39%** | **37%** |
| chance floor (one coherent guess) | 24% | 24% |
Systematic farming is materially reduced (78% to 39%); chance-level partial credit is not zero and cannot be (24% for a single guess). Round 1 was demonstrated per task (above), not simulated in bulk.

## Tie recording (recommendation only; NOT implemented)
Today ties are detected (`rankR2` shares the rank and sets `tie`), shown in the organizer results and CSV ("TIE"), and shown to teams after publication as "(tie)". There is nowhere to record an organizer decision, and publication is allowed with unresolved ties. Proposed, once you approve a decision rule:
1. Additive append-only table `R2TieDecision` (id, rank slot, team ids, decision text such as an order or "shared", reason 10-500 chars, decidedBy, createdAt); the audit log gets the same event.
2. Organizer action `record-tie-decision` (organizer session, same-origin POST, confirmation dialog, only after the round has finished and before publication). Scores and the documented ranking are never changed.
3. Results review shows the original rank, the recorded decision and its reason side by side; "Publish" requires every tie to be either decided or explicitly acknowledged as a shared rank; the participant ranking shows the decision text next to the tied teams; CSV gains `Tie decision` and `Tie reason` columns.
No winner is invented and no tiebreaker is added by the software.

## Concurrency and F5
The per-team lock (`teamTx`) is the default and is preserved: R1 and R2 submissions use it, the 50-team zero-retry burst test and the stop-vs-submissions test pass with the new scoring. `GHOST_TX_MODE=serializable` remains available for investigation only and is not read per round. **Not verified**: behaviour of the lock through Neon's PgBouncer pooler (Phase 6B gate).
