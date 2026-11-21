# Phase 6A: competition integrity, load hardening, release-candidate review

Branch `feat/phase6a-release-hardening` from `887f993`. Everything ran on the disposable `ghost404-pg-test` container with synthetic teams. Nothing was deployed or changed in any hosted environment.

## F3: score farming (REPRODUCED)

**Cause.** Both rounds store, per task, the *union* of criteria earned by any submission. Criteria from mutually incompatible guesses therefore add up.

**Exact reproduction (R2, real graders, `tests/f3-score-farming.test.ts`; through the real service in `tests/round2-policy-db.test.ts`):**

| Task | Guesses needed for full credit | Best single submission |
|---|---|---|
| `i1.classify` (6 pts) | 3: all benign, all suspicious, all compromise = 2+2+2 | 2 |
| `i3.verdicts` (3 pts) | 2: all true, all false | 2 |
| `b3.classify` (6 pts) | 3 constant sweeps | 3 |
| `b4.plan` (3 pts) | 3 option sweeps | 1 |
| `i4.comms` (3 pts) | at most 9 (3x3 sweep) | 2 |
| Round 1 `containment.immediate` (4 pts) | one option per submission, at most the option count (far below the 60-attempt chapter cap) | 1 |

None needs any reading of evidence, and the 12-attempt cap does not prevent it.

**Measured over all 26 R2 tasks (150 seeded runs per task, `test-results/f3/summary.json`).** Share of ALL R2 points a *blind* guesser (no evidence reading) ends with:

| Policy | random guesser | hill-climbing guesser |
|---|---|---|
| CURRENT: union, cap 12 | **78%** | 68% |
| best-coherent, cap 12 | 59% | 60% |
| best-coherent, tiered cap 3/5/8 | 46% | 42% |
| best-coherent, cap 3 | 41% | 37% |
| best-coherent, cap 2 | 35% | 32% |
| chance floor (one coherent guess) | 24% | 24% |

Under the current rule a guesser holds 100% of `i3.verdicts`, `b4.plan`, `b4.comms`, `i4.sequence` and `b1.order`, and 99% of `i1.classify` and `b3.classify`. The hill-climber is a weak lower bound; the deterministic table above is the optimal attack. The "+N points" message is not the leak: the stored union and the task/total scores shown by the status API are.

### Policies compared
**A. Best coherent submission (+ attempt caps).** A task's score is the score of the single best submitted answer; a later answer replaces it only if strictly better (earned never decreases). Caps scale with how guessable the task is. No schema change. Fits ordering/conjunction criteria. Weakness: a residual chance-level score remains (the floor above).
**B. Independent criterion commitments.** Each question locks when answered. Rejected: it gives an immediate per-question oracle (with 3 labels and 2 tries a guesser gets 67% per question, worse than A); many criteria are coupled (pairwise orderings, "both vendor and public correct", set-conjunctions) and cannot be locked on their own; the UI would need per-question submit/lock states and a migration of Round 1 criteria rows.
**C. Delay/hide per-task scores for guessable tasks.** Not sufficient alone (status API, total, Round 1 unlock thresholds are equivalent channels). With A + caps the measured benefit of hiding is small: hill-climbing (which needs feedback) scores 42% versus 46% for blind random under the tiered cap, so feedback adds little once A and caps are in. Round 1 cannot hide task scores at all (they gate chapter unlocks).

### RECOMMENDED POLICY (needs your approval; NOT active)
1. **Score** = best single coherent submission per task ("best"). Improvements earn the remainder; worse or equal submissions change nothing.
2. **Attempts** (graded, distinct answers; identical resends stay free): answer space <= 2^8: 3; <= 2^20: 5; larger: 8 (`attemptCap`). If you want a lower guessing ceiling choose cap 2 for the first tier (about 32-35% blind).
3. **Feedback**: keep "+N, task e/m, total" (needed for partial-credit UX); never criterion detail. No delay (small measured gain, large UX cost).
4. **Anti-probing**: caps above, existing 3 s team gap, strict schemas, full submission audit trail (answers, hashes, timestamps) for organizer review.
5. **Historic compatibility**: no migration. Stored earned values are never reduced; switching from union to best mid-round keeps what was earned (tested). Part A tiebreak time only moves on a real improvement (tested).
6. **UI consequences** (Phase 6B): show "attempts left n/cap" and "your best submission counts" on each task; a worse resubmission shows "No improvement". The server needs to return `attemptsLeft` (small change, not built).
7. **Round 1**: same rule is possible (replace the stored criteria with the best set) but its caps need review per task because many R1 answers are typed IDs; R1 `containment.immediate` is demonstrated farmable; recovery order and Final Verdict reasoning (small choice spaces) are likely candidates but were not measured. Recommended: apply to R1 only after R2 is approved, with task-specific caps, and leave the 60-per-chapter cap as backstop.

**Prototype (dormant).** `src/lib/round2/scoring-policy.ts` + a switch in `submitTask`: `GHOST_R2_SCORING_POLICY=best` activates it; unset or anything else = union (release default). 6 DB tests cover both policies. Round 1 is unchanged.

## F5: 50-team contention (ROOT CAUSE FOUND AND FIXED)

**Not** pool saturation, **not** timeouts, **not** machine load, **not** duplicate awards. It is PostgreSQL SERIALIZABLE false-positive conflicts between unrelated teams.
- Evidence 1: `scripts/f5-siread.mjs` shows the submission queries take SIREAD (predicate) locks at relation level on `Submission_teamId_createdAt_idx` and `TaskScore_teamId_chapter_idx` and page level on `Team_pkey` / `GameSession_pkey`; any other team's insert into those indexes conflicts.
- Evidence 2: 10 independent teams (one request each) already produce 17-24 serialization failures (P2034); only P2034 occurs (no P2028 timeouts).
- Evidence 3: pool size does not matter (and a bigger pool was worse because more transactions overlap).

Controlled results (in-process service, one request per team unless stated; `tests/f5-contention.test.ts`, JSON in `test-results/f5`):

| Scenario | serializable pool 5 | serializable pool 20 | **lock mode** pool 5 | lock pool 20 |
|---|---|---|---|---|
| 10 teams | 17 retries, 0 failed, p99 554 ms | 24 / 0 / 747 | **0 / 0 / 140** | 0 / 0 / 115 |
| 25 teams | 65 / 0 / 1405 | 76 / 0 / 1902 | **0 / 0 / 209** | 0 / 0 / 147 |
| 50 teams | 145 retries, **1 failed**, p99 3235 | 228 / **3 failed** / 2461 | **0 / 0 / 343** | 0 / 0 / 202 |
| 50 teams x 3 identical submissions | 273 / 0 / 2874 | 634 / **5 failed** / 3571 | **0 / 0 / 1276** | 0 / 0 / 436 |
| 50 teams spread over 5 s | 28 / 0 / 1077 | 34 / 0 / 482 | **0 / 0 / 79** | 0 / 0 / 80 |
Every run: 0 duplicate-award incidents, every completed team at exactly 15, failed requests were never partially applied. (Same-team concurrent submissions are refused by the 3 s gap: 100 "handled errors" per 150 requests, by design.)

HTTP-level storm (`node scripts/load-test.mjs --teams 50 --participants 3 --speed 4 --storm`, production build): legacy serializable **47/50 teams completed, 3 invariant violations** (HTTP 409 after retry exhaustion, submit p95 3.4 s); new default **50/50, 0 violations, 0 errors**, submit:right p95 1.5 s, 6,335 requests, server RSS peak 451 MB.

**Fix** (`teamTx` in `src/lib/db.ts`): every competition write is scoped to one team, so each submission now takes `pg_advisory_xact_lock(hashtext(teamId))`, runs READ COMMITTED, and locks the round row `FOR SHARE` (an organizer stop/end waits for in-flight submissions and every later submission sees it). Used by Round 1 `mutateTeam`, the organizer override (same team lock) and Round 2 `submitTask` (locks `R2Session`). Not a retry increase. `GHOST_TX_MODE=serializable` restores the old behaviour. Regression tests: 50-team zero-retry burst, stop-vs-submissions atomicity, override-vs-submission no lost update. Full suite with the change: 19 files / 363 tests pass (1 skipped opt-in).
**Unverified:** behaviour through Neon's PgBouncer transaction pooler. Transaction-scoped advisory locks and `FOR SHARE` are valid there, but this must be confirmed in staging (it is the first item of the rehearsal).

## Release-candidate review
| Item | Result |
|---|---|
| Missing migrations | none: schema unchanged since Phase 5, `prisma migrate diff` empty (Phase 5 smoke, 11 checks) |
| Auth redirects | consistent: `/round2` and R1 pages -> `/login?next=...`, `/admin*` -> `/organizer/login`; `next` is allow-listed |
| Admin controls | every R2 admin function re-checks the organizer session; participants get 401 on admin APIs (browser-verified) |
| Information leakage | no keys or evidence in client bundle (Phase 5 scan); Challenge 3 prompt leak fixed in Phase 5 |
| Feedback mismatches | none found; shared cooldown fixed in Phase 5 |
| Pending UX defects | R1 Containment on phones still ~5,070 px; map edge labels overlap; tablet top bar gap (cosmetic) |
| **Harness defect found and fixed** | `scripts/load-test.mjs` organizer step still posted to the old shared login (CSV and dashboard polling silently skipped); now uses `/organizer/login` |
| Event setup/reset limits | no tool resets Round 2 (enrollment is once per snapshot; start cannot be undone): a rehearsal needs a fresh staging DB, which the plan assumes |
| Unresolved ties | flagged for adjudication, but there is no way to record the organizer's tie decision in the app (decision is manual, outside results export) |
| Deployment config | `render.yaml` is pinned to the Round 1 preview branch, free plan, `autoDeploy: false`; not suitable for the final (see plan) |
| `.env.preview` | contains the Neon URL; keep out of every test command |

## Decisions needed from you
1. Approve the scoring policy (A + tiered caps) or choose another cap (2/3/tiered), and decide whether it also applies to Round 1.
2. Approve keeping `GHOST_TX_MODE` default = per-team lock (recommended; it is already the default on this branch).
3. Decide how ties are adjudicated and recorded.
4. Authorize staging resources and their budget (see the rehearsal plan).
