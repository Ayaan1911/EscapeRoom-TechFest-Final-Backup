# Phase 3: Round 2 "GHOST RETURNS" backend and content

Branch `feat/phase3-round2-backend` (from the finished Phase 2 commit). Backend + content only; **no participant or organizer UI** (Phase 4). Nothing here was deployed, migrated against any real database, or started.

## Layout
| File | Role |
|---|---|
| `src/lib/round2/catalog.ts` | Task ids, parts, titles, point values. No answers. |
| `src/lib/round2/clock.ts` | Pure server clock / state machine / release rules. |
| `src/lib/round2/content.server.ts` | Participant-facing evidence, stories, prompts, option lists. No keys. |
| `src/lib/round2/tasks.server.ts` | Strict zod schemas, answer keys, graders, organizer explanations. |
| `src/lib/round2/play.server.ts` | Status, released bundle, submissions, drafts. |
| `src/lib/round2/enrollment.server.ts` | Qualification snapshot, enroll, standby promotion, readiness. |
| `src/lib/round2/organizer.server.ts` | Start/end, timing, score review, audit, results, publish. |
| `src/lib/round2/ranking.ts`, `safe-json.ts`, `common.server.ts`, `http.server.ts` | Ranking, safe JSON, auth/errors, route helpers. |
| `src/app/api/round2/*` | HTTP API (below). |
| `prisma/migrations/20261121000000_round2` | Additive migration (**unverified against a database**). |

## Data model (all new tables; Round 1 tables untouched)
`R2Session` (single row: `startsAt`, `endedAt`, `resultsPublishedAt`, `contentVersion`), `R2Finalist` (team id PK, `status` active/standby/withdrawn, `seed`, `snapshotDigest`), `R2Submission` (append-only graded attempts, `answerHash`, `contentVersion`), `R2TaskScore` (best-ever earned criteria per task, `lastAwardAt`), `R2Draft` (versioned), `R2Audit` (organizer/system actions). The only link to Round 1 is `R2Finalist.teamId -> Team.id` (ON DELETE RESTRICT), so the same authenticated identities are used. Incident release state is **derived** from `startsAt` (no mutable release table to drift); content versioning is `CONTENT_VERSION` recorded on the session and on every submission.

## Timer state machine (`clock.ts`)
`not_started` → (organizer start) `part_a` [0:00-25:00] → `part_b` [25:00-50:00] → `finished`. Organizer early end jumps to `finished` from either running phase. All times derive from the persisted `startsAt`/`endedAt` and server `Date.now()`; nothing is cached in memory, so reloads and restarts change nothing. Incidents release at 00:00, 06:00, 12:00, 18:00; released incidents stay open until minute 25. At minute 25 Part A becomes read-only and Part B opens automatically; at minute 50 everything closes. Stopping early in Part A never exposes Part B. The round never starts automatically. Deadlines are evaluated **inside the serializable submission transaction** on the server clock, so a late request is rejected even if it began earlier; a concurrent organizer end forces a retry that re-reads the row.

## Qualification and enrollment
`confirmQualification` (Round 1, unchanged) writes an audit record with `digest`, `top10`, `standby`. `enrollFinalists` reads the **latest confirmed record only** (never the mutable leaderboard); with no confirmation it fails with 409. Max 10 active, 2 standby. Idempotent for the same digest; a different digest is refused (use promotion). Enrollment only before start. `promoteStandby` needs a 5-500 char reason; with 10 active a replaced active team is required (becomes `withdrawn`); after start only a team with zero Round 2 submissions may be replaced; never after the round finishes. No score carry-over; Round 1 is never written. Every roster change is audited in `R2Audit`.

## Scoring
Part A = 4 incidents x 15 = 60; Part B = 4 challenges x 10 = 40; total 100. Each challenge has smaller tasks; each task has criteria with points (see the catalog). Graders return satisfied criteria; the service stores the **union** with previously earned criteria, so points never duplicate and a worse retry cannot lower a score. Identical re-submission is idempotent (same answer hash returns the stored state, no attempt consumed). Limits: 12 graded attempts per task, 3 s between a team's submissions. Over-selection rule: where a prompt says so, selecting too many items forfeits per-item credit, and destructive or overbroad choices forfeit the specific criteria (overblocking is penalized without erasing unrelated correct criteria). No hints, no Round 1 deductions or bonuses. Free text (`b4.comms.note`) is stored but never graded. Clients never send scores (strict schemas reject extra fields) and responses never contain criterion ids or keys.

| Unit | Tasks (points) |
|---|---|
| A1 Alert at 2:14 AM (15) | classify 6, assets 3, response 3, justify 3 |
| A2 Kill Switch (15) | identify 6, evidence 5, block 4 |
| A3 Audit the AI (15) | verdicts 3, contradictions 6, corrections 6 |
| A4 Executive Decision (15) | contain 2, preserve 3, comms 3, prereq 2, sequence 5 |
| B1 Reconstruct (10) | chain 2, order 5 (clock-skew traps), root 3 |
| B2 Challenge the Alternative (10) | best 4, eliminate 6 |
| B3 False Intelligence (10) | classify 6, verify 4 |
| B4 Final Command Decision (10) | facts 3, attribution 2, plan 3, comms 2 |

Organizer solutions with reasoning: `GET /api/round2/admin?view=solutions`.

## Results and tiebreakers
Rank by (1) total, (2) Part B score, (3) **Part A completion time** = ms from the server-recorded `startsAt` to the server timestamp (`R2TaskScore.lastAwardAt`) of the **last Part A submission that earned new points**; smaller is better; teams with no Part A points sort last. Teams equal on all three share a rank and are flagged `tie: true` (`tiesNeedAdjudication`) for organizer decision; display order inside a tie falls back to team id for stability only. No bonus points. Results are reviewable only after the round finishes and invisible to teams until `publish` (one-way, audited).

## HTTP API (Phase 4 contract)
Team (active finalist required; team id comes only from the session cookie): `GET /api/round2/status` (clock, own score, per-task availability, no hints), `GET /api/round2/evidence` (released units only: story, records, and per task `{id, prompt, max, availability, fields}`; Phase 4 replaced the free-text `lists`/`answer` shape with machine-readable `fields`, see docs/phase4-round2-ui.md), `POST /api/round2/submit {taskId, answer}` (same-origin, <=16 KB) → `{duplicate, accepted, awarded, task:{id,earned,max}, score:{partA,partB,total}}`, errors `{error}` with 400/403/409/429 (`retryAfter`), `GET|PUT /api/round2/drafts` (`{taskId, data, baseVersion}` → 200 draft | 409 `{current}`), `GET /api/round2/results` (404 until published).
Organizer (`ghost_admin_session`): `GET /api/round2/admin?view=qualification|readiness|timing|scores|audit|results|solutions|results-csv`, `POST /api/round2/admin {action: enroll | promote{standbyTeamId,replacesTeamId?,reason} | start | end{reason} | publish}`.

## Security boundaries
Answer keys exist only in `tasks.server.ts` (`server-only`) and are never imported by client code or serialized. Unreleased units are absent from responses (not hidden client-side). Finalist-only and team-ownership checks on every route; organizer checks inside every privileged service function. Strict schemas, bounded drafts (8 KB, depth/key limits), prototype-polluting keys rejected at parse time, request size limits, same-origin check on mutations, generic 503 messages with server-side logging of error names only. BLOCK actions are inert selections. Round 1 tables are never read for scoring or written.

## Known limits
All finalists receive the same case (no per-team variants), so collusion and shared AI sessions between teams are an operational (proctoring) concern, not mitigated in code. Difficulty relies on distractors, clock-skew normalization, over-selection rules and dependency ordering. Drafts have no separate rate limit beyond size/CAS. Migration and DB tests are unexecuted (see below).

## Verification status
Executed: `tsc --noEmit` (clean), eslint on the new/changed files (clean), `vitest run tests/round2.test.ts` (25 pure tests: catalog totals, every task perfect = max, clock/release/deadlines/restart purity, partial credit, overblocking, malformed payloads, ranking/tiebreakers, safe JSON, key-leak check).
**Authored, NOT executed** (needs a disposable local PostgreSQL; Docker was not running and no disposable instance was available): `tests/round2-db.test.ts` (enrollment authorization, 10/2 limits, promotion, start/release/deadlines against the DB clock, duplicate and concurrent submissions, attempt/cooldown limits, cross-team and non-finalist access, draft conflicts, publish gating, restart persistence, Round 1 isolation). Run with `GHOST_DB_TEST=1 npx vitest run tests/round2-db.test.ts` after `npm run db:test:up`.
Not run: migration against any database, production build, browser suites.
