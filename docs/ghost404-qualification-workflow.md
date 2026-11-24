# Round 1 -> Top 10 -> Round 2 advancement

Commit `b8783e8`. Organizer-controlled; Round 2 never starts by itself.

## Why the organizer could not find the advancement (root cause)
1. "Confirm qualification" only wrote an audit snapshot and its own text said it "does not advance any team to Round 2".
2. Enrolling the finalists was a second, separate action ("Enroll finalists") on the Round 2 page.
3. A tie across 10th place was settled silently by the ranking's last fallback (team ID).
4. Teams had no link, message or state for Round 2 anywhere in Round 1.
The server already refused non-finalists (`requireFinalist`, `finalistAccess`); that part was correct and is unchanged.

## Flow
Round 1 closed (deadline or stop) -> scores saved -> **Review Top 10 Teams** (`/admin#qualification`, also the primary "next action" on the command center) -> **Confirm Top 10 and Advance to Round 2** -> finalists enrolled -> Round 2 control room (readiness shows the real count) -> organizer starts the shared 60-minute round (its own action).

## Rules (server-side, `advanceTopTen` in `src/lib/game/qualification.server.ts`)
- Organizer session required; Round 1 must be closed; Round 2 must not have started; a reason (5-500 chars) is required.
- Source of truth is the saved Round 1 score ranking (max 105), never client values. Pure selection logic: `src/lib/game/top10.ts`.
- One serializable transaction writes the `qualification-confirmed` audit record and the `R2Finalist` rows (10 active + 2 standby). Repeat or concurrent requests are idempotent (one record, one enrollment). A repeat with a different selection is refused (`conflict`): the recorded decision stands.
- Fewer than 10 teams: all advance, nothing is invented.
- **Tie across 10th place** (equal Round 1 score straddling the cutoff): refused until the organizer chooses exactly the open places from the tied group. Never decided by team ID, database order, name or timestamp. Recorded as `tieDecision { manual: true, group, chosen }`, not as a tie-break rule. A manual selection is rejected when there is no tie. The ranking's secondary order (Chapter 2+3, hints, completion, team ID) still orders lists but never settles a cutoff tie.
- Standby = next two in ranking order after the selection; ties inside standby are not resolved (the organizer promotes manually).

## Participant states (`src/components/game/round2-entry.tsx`, from `teamState().round2`)
Qualified before start: "Qualified for Round 2 - Waiting for Organizer". Qualified after start: **Enter Round 2**. Reserve team: "Reserve team for Round 2". Decided but not listed: "Qualification review complete". Nothing shown before the organizer decides. APIs (`/api/round2/status`, `/terminal`) and `/round2` refuse non-finalists server-side regardless of the UI.

## Tests
`tests/top10.test.ts` (11, unit), `tests/advance-db.test.ts` (9: closure, ranking, Top 10, tie, idempotent/concurrent, unauthorized, access, no auto-start, no score change), `tests/phase5-advance.spec.ts` (2 browser: 14 teams, tie at 10th, exactly the approved 10 advance; qualified/reserve/non-qualified states; organizer start). Run on 2026-11-24 before the disk filled: all passed.
