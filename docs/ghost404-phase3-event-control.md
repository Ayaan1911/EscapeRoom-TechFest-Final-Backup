# Phase 3: GHOST//OS event control center (implementation and verification report)

Branch `feat/ghost404-unified-ghost-os`, starting commit `14196cd`. Disposable local PostgreSQL only; no hosted service was touched and nothing was deployed.

## What was built

| Area | Route | Status |
|---|---|---|
| Command center | `/admin` | Done. Hero with freshness stamp and server-offset clock; 7-stage pipeline (Event preparation, Round 1, Qualification review, Round 2 ready, Round 2 running, Jury marking, Results), each stage done / now / pending / blocked with a word and a link; phase-aware "next action" panel; Round 1 chapter progress bars; team table; qualification decision panel; kits; audit; danger zone. Auto-refreshes every 15 s while visible, never while typing or while a confirmation is open. |
| Team management | `/admin#teams` | Done. Search (ID, name, participant), filters (status, candidate group, Round 2 finalists), sort (rank, ID, chapters), detail panel (chapter raw scores, hints, deductions, bonus, completion, overrides, Round 2 state). No access codes or hashes are sent. Read-only: no new edit actions were added. |
| Round 1 administration | `/admin` | Done (existing actions kept): start, stop (type STOP), audited unlock override (now with a team-ID suggestion list), qualification confirmation, CSV export. |
| Round 2 administration | `/admin/round2` | Done. One format only (no selector). Server-offset clock with a stale-connection guard (clock hidden after 15 s without an answer), progress track, four inject cards (pacing only), readiness checklist, enroll and start (two-step), end early (reason, two-step), pens-down state. |
| Terminal review | `/admin/round2` | Done. Summary counts (contained, out of attempts, no attempt), attempt chips (attacker / legitimate, word plus colour), attempts left, lock reason, server score. No reset exists. The untouched-terminal +5 is labelled "no attempts · literal rule (owner decision)". |
| Paper score administration | `/admin/round2#marking` | Done (new). Injects 1, 3, 4 only, 0-15 whole numbers, marker name required, terminal score read-only, pending never zero, audited with previous value, publish gate, locked after publication. New table `R2PaperMark` (additive migration `20261125000000_round2_paper_marks`). |
| Leaderboard | `/admin/leaderboard` | Done (new). Projector publication switches (audited, confirmed, default OFF); Round 1 standings with podium and shared ranks; qualification groups; Round 2 results with each part's source and pending states. |
| Projector | `/admin/projector` (`/admin/round2/projector` redirects) | Done. One broadcast with 8 scenes chosen by the server: standby, Round 1 live, Round 1 closed, intermission, Round 2 waiting, Round 2 live, pens down, results. Countdown only to a server deadline; brass under 5 min, red under 1 min, no flashing; hidden when the connection is stale; reduced-motion support; no controls on screen. |
| Demo Mode home | `/admin/demo` | Done. Mission map: 5 Round 1 chapter modules on a path, 4 Round 2 inject modules, answer-free scenario lines, simulation status including whether the private key is installed (offline when missing; no fallback answers). |

### Rules preserved
Round 1 scoring, unlocking and qualification rules are untouched. Round 2 timing, the single 60-minute format and the terminal (4 attempts, scoring, locks, rate limit) are untouched. The Inject 2 score is never typed and never added twice (total = Inject 1 + terminal + Inject 3 + Inject 4, once each).

### Scores, ranking, publication
- Round 1 score: `score()` in `src/lib/game/engine.ts` (max 105 including the +5 bonus). Qualification order uses the existing approved tie-break; the standings view shows equal scores as a shared rank (=).
- Round 2 score: terminal via `terminalReview()` (server), paper marks from `R2PaperMark`; arithmetic in `src/lib/round2/paper/marking.ts` (unit-tested).
- No Round 2 tie-break is approved: equal totals share a rank.
- Nothing appears on the projector unless the server state or an organizer switch allows it: Round 2 results only after publication; Round 1 standings and finalist names only after an audited switch.
- No overall Round 1 + Round 2 ranking is computed (no approved formula).

### New and changed files (main ones)
`src/app/admin/page.tsx`, `src/app/admin/leaderboard/page.tsx`, `src/app/admin/broadcast-actions.ts`, `src/app/admin/projector/page.tsx`, `src/app/admin/round2/projector/page.tsx`, `src/app/admin/demo/page.tsx`, `src/app/command.css`, `src/components/admin/{cc,live,team-table,broadcast}.tsx`, `src/components/game/qualification-board.tsx`, `src/components/round2/paper/paper-control.tsx`, `src/lib/game/{stages,broadcast}.ts`, `src/lib/game/broadcast.server.ts`, `src/lib/round2/paper/{marking.ts,marking.server.ts}`, `src/app/api/round2/admin/route.ts` (views `marking`; actions `mark`, `publish`), `src/app/api/admin/projector/route.ts`, `prisma/schema.prisma` + migration. Removed: `projector.server.ts`, `projector-board.tsx`, `event-pipeline.tsx` (replaced).

`scripts/ui-dev.mjs` gained `GHOST_UI_STATE=prep|r1|qual|r2wait|r2run|r2end|results` seeds for screenshots (the Round 2 seeds use the synthetic test-fixture key, never the case key).

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (clean) |
| `npx eslint .` | PASS (0 errors, 0 warnings) |
| `npx next build` | PASS |
| Client bundle scan (`.next/static` for key fields) | PASS (no matches) |
| `GHOST_DB_TEST=1 npx vitest run` | PASS: 482 passed, 19 skipped (30 files passed, 2 skipped). New: `tests/event-control.test.ts` (11: result arithmetic, pending, ties, pipeline, scenes) and `tests/marking-db.test.ts` (6: authorization, validation, audit, publish gate, no double counting, projector payload). |
| Smoke: `node scripts/redesign-e2e.mjs tests/ui-projector.spec.ts tests/demo-mode.spec.ts` | PASS: 5 of 5 (projector private by default; publication switch shows standings only after an audited, confirmed change; minimal payload; no controls; demo walkthrough makes no API write; real routes protected) |
| Smoke: `GHOST_P5_SEED=enrolled node scripts/phase5-e2e.mjs tests/phase5-event-control.spec.ts` | PASS: 2 of 2 (organizer access, pipeline, team search/details, no codes, no overflow at 1366x768, nothing starts by viewing; start the 60-minute Round 2, marking validation, read-only terminal score, pending, pens down, team 401, results hidden until publication, publish, lock, projector results) |
| Earlier in this pass (before the final docs, same code paths) | `phase5-event-control` 2/2; `marking-db` 6/6 |
| **Exhaustive browser regression** (all phase5 specs, redesign suites, Phase 2, Round 1 chain, journey) | **DEFERRED.** Started, then stopped on the owner's instruction before any suite reported; no results were produced (partial log `D:/Ghost404-TestWorkspace/p3-reg-partial.log` holds only the header). The previous full pass ran on `14196cd`, before Phase 3. |

Specs changed by design in Phase 3 (not yet run in this pass, part of the deferred regression): `phase5-ghostos-shell` (7-stage pipeline), `phase5-ghostos-layout` (projector heading regex; added leaderboard and demo home), `ui-projector` (run, passes).

### Screenshots (outside the repository)
- Before: `D:/Ghost404-TestWorkspace/shots/p3-before/` (`admin`, `r2admin`, `demo`, `projector`, `projector1` at 1366x768 full page; projectors at 1920x1080).
- After, per event stage: `D:/Ghost404-TestWorkspace/shots/p3-prep`, `p3-r1`, `p3-qual`, `p3-r2wait`, `p3-r2run`, `p3-r2end`, `p3-results`. Each holds `admin-1366x768.png` (command center), `r2admin-1366x768.png` (Round 2 control), `board-1366x768.png` (leaderboard), `projector1-1920x1080.png` and `projector1-1366x768.png` (projector scene). `p3-qual` also has `demo-1366x768.png` (Demo Mode home).
- From the browser journey: `D:/Ghost404-TestWorkspace/shots/p3-e2e/` (`command-center.png`, `marking-complete.png`, `projector-results.png`, `leaderboard-r2.png`).

## Known issues and limits
- The deferred browser regression may still find regressions in specs that touch `/admin` text or layout. The Round 1 chain (start, stop, override, qualification confirmation) was NOT re-run in Phase 3; those controls keep their exact labels, and the qualification table keeps its name, row ids and "x / 105" score text.
- Each `ConfirmForm` renders its own dialog with the same heading id (`confirm-title`): pre-existing, harmless but invalid HTML when a page has several.
- No separate judge role: any organizer session can mark. The marker name is recorded.
- The projector needs an organizer session on the projector PC (as before).
- Terminal review shows each attempted IP and whether it was an attacker; organizer-only, but keep the control-room screen away from participants.
- Not tested: real LAN, real projector hardware, Ubuntu server, a human run-through of the organizer flow.

## Owner decisions still open
1. Untouched terminal scores 5 under the literal formula.
2. Round 2 tie-break (none approved; ties share a rank).
3. Whether a separate judge login is needed for marking.
4. Whether Round 1 standings may be shown live during Round 1 (switch exists, default OFF).
