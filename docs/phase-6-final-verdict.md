# Phase 6: Final Verdict — Close the Case

Final Verdict completes playable Round 1 at `/play/verdict`, validator index 4, for 15 raw points. It branches from verified Phase 5 commit `9b03b1ba8be0ff63ee41ccc2987e495350d3cc0c`. The existing score engine, ranking algorithm, participant sessions, original 60-minute round, saved progress, physical Insider access and CCTV grants remain in use. Round 2, production deployment and merging main are outside this phase.

## Gameplay and evidence synthesis

After Containment completion or an audited organizer progression override, open **Open Chapter 5**. The review file contains an incident summary, seven prior timeline references, an 18-record evidence matrix, the staff roster, competing explanations and a structured conclusion. It reuses actual server-only Inbox, Trail, Insider and Containment generators rather than rewriting old keys or inventing a different incident.

The participant selects the initial email, victim account, retained capture/campaign, exact replayed session, unauthorized customer export, insider employee and signed policy modification. The campaign is carried from the selected capture's visible metadata, avoiding another field to type; the server still validates both values. Selectors include legitimate managed sessions, maintenance/archive exports, ordinary policy commands and other staff, so correct account ownership or a suspicious display name alone is insufficient.

Assign twelve distinct retained records to five roles:

| Role | Required independent corroboration |
|---|---|
| Entry point | Recovered initial email, navigation ledger and retained redirect capture |
| Authentication/session abuse | Original session issuance and later changed-device/session validation |
| Data impact | The matching unauthorized `customer_directory` database audit |
| Insider assistance | Signed unauthorized policy diff, journaled intent, console/access receipt, original approval contradiction and custody/device attribution |
| Containment rationale | Incident-lead response authority and business constraints from Chapter 4 |

The mail delivery ledger may supplement entry; the original CHG-219 ticket may supplement assistance. Extra contradictory records, unknown IDs and reuse of an evidence ID in multiple roles are rejected. Search/filter the matrix, inspect source facts and assign a role to pin each record in the notebook. Full reload resets unsubmitted form/notebook drafts; trusted game progress is persistent. Earlier permitted evidence routes remain available for review.

## A/B/C continuity

| Variant | Victim / incident session | Entry / campaign | Customer audit | Policy accomplice / change |
|---|---|---|---|---|
| A | Maya Rao / `nx-a-72c` | `MAIL-A-02` / NX-41 | `DB-A-01` | `EMP-A-04` / `POL-A-04` |
| B | Ishan Sen / `nx-b-19f` | `MAIL-B-04` / NX-73 | `DB-B-02` | `EMP-B-02` / `POL-B-07` |
| C | Leena Das / `nx-c-84d` | `MAIL-C-01` / NX-26 | `DB-C-01` | `EMP-C-05` / `POL-C-02` |

All retain policy modification 09:11:18, lure navigation 09:14:05, capture 09:14:07, replay 09:16:22 and export 09:18:04 UTC on November 16, 2026. The later detection at 09:18:34 and response checkpoint at 09:32:00 are exactly the derived simulation records introduced in Containment. Original issuance is 08:53:40 on the registered workstation; it must not be confused with the later replay. The response review establishes a prepared plan, not independently executed recovery or reversal of an export.

The attacker alias GHOST_404, compromised employee victim and internal accomplice are separate roles. Source IPs remain documentation addresses; no real-world identity, location, nationality or psychological motive is established. Final Verdict requires the attribution limit `alias-only` and response status `plan-prepared`. Ungraded prose is a student's observation, not a server-verified factual claim.

## Hypotheses and contradiction requirements

Three variant-specific hypotheses appear in non-ordinal ID order. The supported interpretation correlates the assigned capture/campaign and replay session with customer impact and independently attributed internal policy assistance. Its ID differs between A/B/C; there is no client-side “H2 is correct” flag. Selecting the interpretation alone earns nothing without the full causal binding and evidence-role map.

Reject either competing interpretation with exactly two genuine counter-records:

- **Victim alone on a registered workstation, no session abuse or relevant policy change:** contradict it using the assigned Trail replay event and signed policy modification. Those records establish changed-device validation and a relevant internal command; they do not justify inventing a victim motive.
- **Authorized maintenance/archive activity:** contradict it using the customer export audit and original CHG-219 approval. The actual account/session/object and narrow `maintenance_manifest` scope do not authorize the `customer_directory` export. Routine CHG-204 archive work is also distinct.

The matrix notebook supplies counter-evidence selectors. To use the CHG ticket there, pin it as additional assistance evidence. Either supported contradiction is accepted; mixing the alternative label, contradiction type or unrelated evidence is rejected.

## Trusted validation and authorization

`POST /api/game` retains chapter 4, action `submit` or `hint`, the existing same-origin check, body limit and persisted three-second cooldown. Strict Zod schemas validate the nested causal chain, evidence-role arrays, supported hypothesis, rejected alternative and counter-evidence, attribution/response limits and optional bounded explanation. All fact relationships must belong to the logged-in team's assigned variant. No client points, team/variant selectors, answer keys, motives or extra fields are accepted. Wrong answers receive generic feedback, without identifying the failed field. Prose is not keyword-scored.

`/play/verdict` and `/api/game/verdict` independently require a valid team session, a started round and completed Containment. Selector query parameters fail rather than choosing another team/variant. Anonymous and organizer sessions cannot read participant case files through this endpoint. The response contains review evidence only, with no expected mapping/solution, competing team data, session credentials or Insider fragment values. Historical permitted evidence remains readable after completion/round closure. Admin reports and exports require an administrator session; they never become participant leaderboard endpoints.

The final validator and data generator remain `server-only`. The participant imports only public types, the existing pure engine/result-display helpers and returned evidence. Evidence is text, not executable HTML or external navigation. No security operation, real token revocation, account modification, notification or credential collection is implemented.

## Scores, hints and completed cases

The raw chapter caps remain 15 + 25 + 25 + 20 + 15 = 100. The earlier global Tamper Alert adds at most 5, so the maximum saved Round 1 score is 105. Final Verdict offers no new bonus. Hint 1 costs 3; hint 2 costs 6 additional; maximum two. Hint 1 directs comparison across all four chapters; hint 2 emphasizes causal consistency and distinct victim/attacker/insider roles.

An accepted verdict awards exactly 15 raw points once, saves the server decision/completion timestamp and sets `current` to -1 through the existing engine. The shared submission service now rechecks the authoritative deadline after validation and before awarding points/bonus, then uses that decision time for completion. This closes the regression where validation could begin just before expiry and otherwise award points after expiry using its old timestamp. The timer, deadline and scoring formulas are unchanged. The decision time is the authoritative acceptance boundary; an in-flight database commit can finish later, but new/expired decisions are rejected. Serializable transactions protect duplicate/concurrent completions and concurrent round closure.

`CASE CLOSED — INVESTIGATION COMPLETE` appears on the verdict page and participant dashboard. It shows only the signed-in team's name/ID, five raw scores/statuses, hints and deductions, bonus, total out of 105, server-recorded completion time and earlier evidence links. Overrides remain visible and award zero unearned chapter points. Refresh, logout/login and restart preserve completion. A completed team cannot restart or resubmit. The screen explicitly says completion does not confirm qualification; no participant receives automatic Round 2 advancement.

## Organizer qualification workflow

Open `/admin` and review **Registered teams and qualification**. The existing ranking function is unchanged:

1. Higher saved total.
2. Higher combined Chapter 2 + Chapter 3 raw score.
3. Fewer hints used, not merely a smaller point deduction.
4. Earlier recorded final completion; missing completion is treated as later than a recorded completion for this tie-break.
5. Deterministic team ID if all preceding values tie.

Incomplete investigations remain in ranking, even when their score places them above a completed investigation. They are clearly flagged for human review. The first up to ten actual teams are qualifying candidates; the next up to two are standby candidates. Zero/small rosters never acquire fictitious teams. The board shows five raw scores, per-chapter hint counts/deductions, bonus, final total, completion UTC, tie-break values and all audited progression overrides. Refresh the view at the original deadline or after early stop to get current closure status.

- Before closure: **PROVISIONAL**. Confirmation is disabled and server-rejected.
- After natural expiry or early stop: **FINAL / PENDING ORGANIZER CONFIRMATION**.
- After an authorized reviewed confirmation: **FINAL / ORGANIZER CONFIRMED**.

Before confirming, inspect incomplete candidates, ties and all overrides. Enter a reason and acknowledge review. The action independently checks administrator identity and closed-round state, computes the ordered result snapshot on the server, and records `qualification-confirmed` in existing audit history. The snapshot digest includes the round and saved roster/result data. Duplicate/concurrent confirmation of that exact snapshot produces one audit record. A changed roster/result snapshot becomes pending again; a matching earlier confirmation only applies to identical data. This is an auditable review record, not an automatic Round 2 transition or score edit.

Leaderboard/CSV reads do not mutate teams, progress, scores, the round or audit history. Confirmation writes only its audit record. No migration, reset/replay button, alternate deadline or Round 2 table is added.

## CSV export

The administrator-only `/api/admin/scores` export retains its original first six columns: Rank, Team ID, Team, Score, Hints, Completed. It appends ranking state, candidate group, five raw scores, five hint counts, five deductions, total deduction, bonus, Chapter 2 + 3 raw score, completion/incomplete status and override chapters. The filename remains `round-1-scores.csv`; responses are `no-store`.

Every cell uses the existing formula-injection-safe CSV encoder, including user-controlled IDs/names and multiline/quoted values. Leading spreadsheet formula/control prefixes are neutralized. Epoch-zero completion is rendered as a real timestamp rather than a missing value. CSV uses the same saved ranking/result snapshot and labels as the board; it contains no passwords, code hashes, fragments or game-session tokens.

## Temporary demo and tests

Run `npm run demo:verdict` on an unused local port 3000, or set `DEMO_ORIGIN=http://127.0.0.1:3001` for another unused port. It creates a new OS-temporary SQLite database, applies existing migrations only there, generates demo-only credentials and adds `VERDICT-A`, `VERDICT-B`, `VERDICT-C` with all four earlier chapters completed. Separate demo-only Insider access records preserve historical review consistency. A starts at 90 including an earlier +5; B/C start at 85. The real `.env` database, saved teams, fragments and migrations are not changed.

1. Read the generated access code in the console and sign in as a demo team.
2. Open Final Verdict, inspect sources/hypotheses and link the causal claims/evidence roles.
3. Use a hint if desired, provide a supported contradiction and submit. With no new hints A reaches 105; with one hint A reaches 102 or B/C 97.
4. Review CASE CLOSED and verify refresh/logout/login recovery.
5. Sign in as organizer and inspect the small-roster provisional board. Stop only the demo round, review final incomplete cases, export CSV and record confirmation if appropriate.
6. Ctrl+C stops the owned local demo server and removes only its uniquely created temporary directory. Never use this runner to register/reset real event teams. A crash can leave a `ghost-inbox-demo-*` folder under OS temp; inspect the exact path and ensure its owned server is stopped before removing only that folder.

No new production environment variables, packages or schema/migrations are required.

```powershell
npm run lint
npm run typecheck
npm test
$env:GHOST_DB_TEST='1'; npm test; Remove-Item Env:GHOST_DB_TEST
npm run test:e2e:verdict
npm run build
```

The full browser runner executes every preserved routes/Inbox, Trail, Insider/restart and Containment/restart suite before Final Verdict and a new-process final restart suite. New chapter fixtures are added only to its disposable database. Earlier test progress/fragments remain in place. Result manifests/screenshots/CSV and previous print-check outputs are ignored under `test-results`; generated login credentials and databases must not be committed. The opt-in database tests use their own fresh temporary database, including a simulated fresh login-rate window between chapter scenario groups. The 50-team provisioning fixture has a 20-second test timeout to accommodate its scrypt/2,500-comparison workload; its assertions are unchanged.

## Security findings and remaining event readiness

The existing three high npm findings remain along `prisma → @prisma/config → deepmerge-ts`. The underlying [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) concerns recursive-object stack exhaustion before deepmerge-ts 8.0.0. Do not run `npm audit fix --force` or an unplanned Prisma/transitive major upgrade. Track a tested compatible Prisma/client remediation separately and keep untrusted executable configuration away from build/migration tooling. Source imports and production dependency traces must be checked; absence of a discovered game-request path does not remove an installed tooling advisory.

Keep the event database and backups private because they retain earlier physical reprint fragments. Rehearse envelope/wall/CCTV placement and accessible-copy procedures, student timing, organizer review, cutoff behavior and CSV use. Persistent hosting, backup/restore, realistic 40–50-team concurrent load and deployment-specific session/origin settings still need event validation. Passing local tests is not proof of production readiness or concurrent event capacity. This phase completes playable Round 1 only; it does not implement Round 2, deploy or merge main.
