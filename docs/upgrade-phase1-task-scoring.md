# Upgrade Phase 1: task-level scoring, chapter unlocking, drafts (backend only)

Additive and backward compatible. No UI change; no Round 2.

## Data model (migration `20261120000000_task_scoring_and_drafts`, additive)
- `TaskScore(teamId, taskId)`: best-ever earned criteria per task. Criteria are only ever added (monotonic).
- `ChapterDraft(teamId, chapter, taskId)`: unscored work-in-progress, `version` compare-and-set.
- `Submission` gains nullable `scoringVersion`, `awarded`, `chapterRaw`, `criteria`. `NULL` = historical (pre-v2) row, never rewritten.
- `Team.progress` JSON stays the aggregate source for totals/ranking/CSV; chapter `score` is the raw high-water mark. New optional `chapters[i].unlockedAt`.

## Scoring
Catalog in `src/lib/game/scoring.ts` (ids and points only, no answers). Graders live beside each validator (`grade()`).
chapter raw = max(stored chapter raw, sum of earned task points); a criterion is earned at most once; points never decrease.
Responses expose only per-task earned/max, never criterion ids.

| Chapter | Max | Tasks (points) |
|---|---|---|
| 1 Inbox | 15 | entry 6 (emailId 2, deliveryId 2, snapshotId 2) · identity 6 (authenticationId 3, sessionId 3) · impact 3 (databaseId 3) |
| 2 Trail | 25 | source 8 (account 4, sourceIp 4) · session 10 (sessionId 4, eventId 6) · corroboration 7 (mint event 2, capture 2, DB audit 3) |
| 3 Insider | 25 | suspect 8 · action 7 · corroboration 10 (message 4, access 3, approval 3; withheld if any id outside the allowed set is submitted) |
| 4 Containment | 20 | timeline 6 (3 position groups x 2) · identity 2 · immediate 4 (1 per required action; any wrong action zeroes the task) · recovery 6 (right set 1, 5 ordering edges x 1, only if set right) · evidence 2 (forensic 1, response 1) |
| 5 Verdict | 15 | entry 3 · session/impact 3 · insider 2 · evidence map 5 (1 per role; evidence reused across roles voids it) · reasoning 2 (hypothesis 1, valid contradiction 1) |

Full-answer equivalence with the legacy validators is tested for all variants A/B/C (and the alternative Verdict contradiction).

## Unlocking (raw points, before hints/bonus)
Inbox 8/15 -> Trail; Trail 13/25 -> Insider; Insider 13/25 -> Containment; Containment 10/20 -> Final Verdict.
`unlocked(p, i)` = recorded `unlockedAt` OR previous raw >= threshold OR previous chapter completed (legacy/override). Evidence APIs gate on this. Completed chapters (full marks, legacy, override) are closed; unlocked incomplete chapters stay open for submissions and hints.
Insider's Fragment A/B dossier requirement is unchanged and still gates Insider submissions.
Organizer override completes the first incomplete chapter whose successor is locked, keeps earned points, awards none, audits `{teamId, reason, chapter}`.

## Anti-probing
Existing 3 s cooldown + `MAX_SCORED_ATTEMPTS` (40) scored submissions per chapter + per-task (not per-criterion) feedback.

## Drafts API
`GET /api/game/drafts?chapter=N` and `PUT /api/game/drafts` `{chapter, taskId, data, baseVersion}`; team comes only from the session.
taskId is a catalog task id or `notes`; payload is a flat bounded map (<= 40 keys, scalars/short lists, <= 8 KB). Stale `baseVersion` -> 409 with the caller's own newer copy. Locked chapter / inactive round -> 403. Never touches scores or submissions.

## UI note (Phase 2)
Desks still gate editing on `state.current` (first incomplete chapter), so a team that has unlocked a later chapter while an earlier one is incomplete cannot edit it from the existing UI yet. `teamState` now also returns `unlocked[]`, `unlockThresholds`, and `tasks[][]` for the new UI.
