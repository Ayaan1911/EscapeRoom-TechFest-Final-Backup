# Phase 5: Containment — Stop the Breach

This records the Phase 5 delivery. Final Verdict and the Round 1 qualification review are now implemented in [Phase 6](phase-6-final-verdict.md); pending-content statements below describe the earlier phase.

Chapter 4 runs at `/play/containment`, validator index 3, for 20 raw points. It continues the verified Phase 4 commit `1cf39d0b55a468744b37fceffa48f9c7edafcd71`. The existing shared 60-minute round, sequential progress, session security, serializable submission transaction, three-second cooldown, ranking and global +5 Tamper Alert remain unchanged. Final Verdict becomes current at index 4 after completion but is still a placeholder. This is verified gameplay, not a production-readiness claim.

## Simulation boundary

Every response option is an inert fictional decision. Selection and reordering only change form state; submission validates a plan and saves game progress. Nothing blocks an IP, revokes a real session, modifies a policy, rotates a real key, sends a notification, stops a host or deletes a log. Domains are `.example` and inherited IPs are documentation addresses. External-looking addresses in records are rendered as text. The only operational processes stopped during verification are the owned local test/demo servers during their documented cleanup, never a simulated incident action.

## Seven-event model and continuity

Seven cards start shuffled with non-ordinal IDs. The response form holds their current order. Trusted source records determine chronology; neither card IDs nor initial positions encode the solved order. Two separate supporting observations show the approved 06:00 archive export and 09:20 alternate-network maintenance export. Neither belongs in the seven-card incident chain.

| Event | UTC on November 16, 2026 | Trusted source / derivation |
|---|---|---|
| Unauthorized existing-session control change | 09:11:18 | Insider policy mirror: A `POL-A-04`, B `POL-B-07`, C `POL-C-02` |
| Victim navigation from delivered lure | 09:14:05 | Actual `CLICK-{variant}-01` ledger entry linked to the retained campaign |
| Redirect capture | 09:14:07 | Actual `CAP-{variant}-17` capture timestamp and destination |
| Attacker session validation/replay | 09:16:22 | Inbox authentication record and exact Trail validation row |
| Unauthorized customer export | 09:18:04 | Actual Inbox database audit, principal, session and operation |
| Simulated SOC correlation detection | 09:18:34 | New `DET-{variant}-05` simulation record, derived as export time + 30 seconds; detection performs no containment |
| Response checkpoint | 09:32:00 | New `IR-{variant}-11` record, derived as Insider custody sealing time + one minute |

The last two are explicitly new fictional response records, not claims that earlier fixtures already contained a monitor or response. Existing statements and answer keys are not rewritten to accommodate them. Before this checkpoint, no targeted revocation or closure of the export exception is recorded, so the response must conservatively treat the stolen session as usable. Detection alone does not revoke anything.

Variant A retains Maya Rao / `nx-a-72c`, `MAIL-A-02`, `AUTH-A-02`, `EV-A-074`, `DB-A-01`, and the policy actor `EMP-A-04`. B retains Ishan Sen / `nx-b-19f`, `MAIL-B-04`, `AUTH-B-01`, `EV-B-113`, `DB-B-02`, and actor `EMP-B-02`. C retains Leena Das / `nx-c-84d`, `MAIL-C-01`, `AUTH-C-02`, `EV-C-052`, `DB-C-01`, and actor `EMP-C-05`. All inherited incident sources remain `203.0.113.41`; no geolocation or reputation is invented. New event/action IDs differ between variants while event counts, decision choices, constraints, required reasoning and scoring are equivalent.

The external attacker, replayed employee victim and internal policy accomplice remain separate identities. The original registered-device session issuance is earlier legitimate context; it is not mislabeled as the later captured redirect or attacker replay. The ordinary archive and maintenance sessions do not become attacker sessions merely because they also export data or change source.

## Containment and recovery rationale

The four selected immediate actions form an **unordered parallel batch**:

- Revoke the exact stolen replay session and derived tokens for the affected identity.
- Gate the affected customer export privilege without stopping support read paths, approved archive jobs or unrelated workloads.
- Preserve authentication/database/policy records, captures and message references in an immutable evidence hold with integrity and custody information.
- Notify the simulated internal incident lead/data owner and obtain the recovery authorization workflow.

Preservation starts alongside urgent containment. The exercise never requires waiting for a finished evidence copy before revoking an actively abused session. The completed batch is the boundary before ordered recovery; no destructive evidence loss is permitted. A password-only reset and a source-only block are insufficient substitutes for session revocation. Blanket workload shutdowns, deleting logs, restarting the whole fleet before retention and trusting unsupported AI advice violate the retained response authority or business constraints.

Six recovery decisions are required:

1. **Close exception:** restore current-device attestation and scoped expiry, retaining the original policy diff.
2. **Verify identity/authority:** establish out-of-band employee identity, a known-good device and incident-lead/data-owner permission.
3. **Replace affected material:** re-enrol scoped session/refresh authentication material under that authority; do not rotate unrelated company/workload keys.
4. **Verify barrier:** confirm old replay tokens are denied, the exception is closed, replacement material is scoped, evidence is held and affected export is still gated. This is a simulated evidence check, not a real network probe.
5. **Restore minimally:** restore only approved export scope on the verified device after the barrier check.
6. **Monitor after restoration:** check simulated session/export records for recurrence and confirm support/archive continuity.

The server enforces only these dependency edges: Close → Barrier; Identity/authority → Replace material → Barrier → Restore → Monitor. Close and identity verification are independent. This admits exactly three total orders for these six steps:

| Accepted prefix | Common suffix | Why it is safe |
|---|---|---|
| Close, Verify identity, Replace material | Barrier, Restore, Monitor | Closes the weakness while identity/authority work is prepared |
| Verify identity, Close, Replace material | Barrier, Restore, Monitor | Identity is verified first; both closure and authorized material replacement precede testing |
| Verify identity, Replace material, Close | Barrier, Restore, Monitor | Export remains gated and the stolen session revoked during replacement; the weakness is still closed before the barrier check and restoration |

The ordered board represents a safe linearization of this dependency graph, not a claim that independent real response work must be serial. Evidence preservation can proceed concurrently with urgent revocation/restriction/escalation. No accepted order restores before identity, policy closure, scoped material replacement and the containment barrier are established. Final monitoring occurs after restoration because it checks the restored state.

## Interface and validation

The SOC workspace includes the seven-card board, keyboard move-up/down controls, the supporting-record drawer, two approved-workload observations, physical CCTV reference, evidence notebook, immediate action checkboxes, ordered recovery plan, affected account/session confirmation, optional explanation, hints, saved score and shared countdown. Tab then Enter/Space operates reorder buttons, and movement is announced to assistive technology. No drag library or second timer/scoring system is introduced.

`POST /api/game` uses chapter 3 and action `submit` or `hint`. The strict structured plan has `kind:plan`, seven unique ordered event IDs, affected account/session, unique immediate action IDs, ordered recovery IDs, supporting evidence IDs and optional explanation. The server requires the exact seven-event chronology, the matching victim/session, all four scoped immediate actions, all six required recovery steps in a safe topological order, and five corroborations: policy mirror, replay authentication, unauthorized export, response constraints and CCTV reference. Related capture/custody/approved-workload evidence may also be included. Unknown/duplicate IDs, wrong targets, unsafe additions, missing steps, client points, answer keys and selectors are rejected. Prose is not keyword-scored. Rejections are generic and do not identify the failed component.

A fully supported plan awards 20 raw points once, then applies existing saved hint deductions. Hint 1 costs 3 points; hint 2 costs 6 additional points; maximum two. The first directs students to trusted timeline sources; the second explains parallel containment versus dependent recovery. No new Tamper Alert claim is introduced. Earlier +5 stays capped at +5; without an earlier claim, Containment does not create one. Full raw score through Chapter 4 is 85, or 90 including the earlier bonus, before deductions. The round still displays its existing eventual 105-point ceiling.

The UI shows active, completed and finished/read-only states. Waiting-round access returns to the waiting dashboard. Refresh and logout/login retain server progress, hints, completed score and authorized clue access. Unsubmitted board order, selected actions, explanation and notebook are page-local drafts; refreshing resets them. Reconnect polling retains the current form while checking trusted progress.

## Printable security-room clue and accessible fallback

As organizer, open `/admin/containment-kit` through **Print Containment CCTV kit** in `/admin`. Choose all variants or one variant, then print A4 with browser headers/footers disabled and default/actual scale. Each variant occupies one page. Place labeled A/B/C copies at the security-room evidence station, with accessible desk-height copies and clear directions. Extra identical copies can reduce crowding.

The sheet is a **fictional reconstructed access snapshot**, made from code-native room/console shapes. It depicts no real person or camera. It carries `CCTV-{variant}-08`, the actual 09:10:11 access timestamp, fictional area label, assigned console/device, employee assignment, original access receipt and Insider custody reference. It corroborates access opportunity before the later policy change; it does not prove intent alone. The diagram is illustrative, not a measured floor plan. It contains no seven-event solved array, response choice IDs, recovery order, answer key, Insider fragments or live credential.

If a sheet is missing, damaged or inaccessible, a volunteer verifies team ID and asks an organizer to use **Authorize an accessible evidence copy**, with a reason of at least five characters. Only an eligible team in an active round can receive a new grant. The grant is recorded in existing audit history; it awards no points, consumes no hint and does not advance progress. The team presses **Check authorized CCTV copy**. Its protected route returns only its own variant snapshot. Another team's grant is not reusable. Already authorized copies remain readable with permitted historical evidence after the round ends; no new grants are issued in a closed round. The print station remains the normal source, and organizers can always reprint its non-secret fictional clue.

This chapter's CCTV reference is corroborating evidence, not a new secret physical unlock. A team that guesses a reference ID or shares narrative evidence is not cryptographically prevented from submitting a plan; physical review must be supervised operationally. The actual Insider A/B physical gate and its persistence remain unchanged. The fallback is withheld from participant HTML/API responses until explicitly authorized; no full snapshot is preloaded merely because its ID is public.

## Authorization, persistence and deployment limits

The page and `/api/game/containment` require a valid team session, a started round and completed Insider, including an audited zero-point progression override. The API accepts no team/variant selector query; forged selector requests fail. Organizer/anonymous sessions do not gain participant evidence access. Expired rounds keep permitted history readable but reject new hints and submissions on the server. Existing serializable transactions/cooldown prevent concurrent or duplicate scoring. Print and fallback grant actions independently require administrator authorization, and Next.js server-action origin checks remain enabled. All evidence is rendered as text; there is no HTML execution or external decoy navigation.

No new environment variables, packages, schema changes or migrations are needed. No development/event database is reset, reseeded or migrated by this phase. Snapshot grants use the existing audit table, with exact team matching and transactional duplicate protection. Preserve the existing database and backups as private material because they contain the earlier Insider reprint fragments. SQLite hosting persistence and concurrent-write capacity still need a deployment plan/rehearsal; multi-instance stateless hosting is not ready simply because local gameplay passes.

The existing three high-severity npm findings remain on `prisma → @prisma/config → deepmerge-ts`. The underlying [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) concerns recursive object-graph stack exhaustion in deepmerge-ts before 8.0.0. npm proposes Prisma 7.10.1 as a major change. Do not run `npm audit fix --force` or an unplanned major/transitive override. Keep untrusted executable configuration away from build/migration tooling and plan a compatible, tested Prisma/client upgrade separately. Production route traces and source imports must be reviewed again before deployment; lack of a discovered game-request path does not remove the installed tooling finding.

## Demo and verification

Run `npm run demo:containment` on unused local port 3000, or set `DEMO_ORIGIN=http://127.0.0.1:3001` for another unused port. A fresh OS-temporary SQLite database receives all existing migrations, generated demo-only login credentials and three ready teams: `CONTAIN-A`, `CONTAIN-B`, `CONTAIN-C`. Inbox, Trail and Insider are completed fixtures; each has a separately generated demo-only Insider access record for historical consistency. The real development database and earlier fragment pairs are not modified. A starts at 70 with the earlier bonus; B/C start at 65.

1. Read the generated temporary access code in the demo console. Sign in as organizer and print the CCTV sheets; authorize a fallback copy if needed.
2. Sign in as a demo team and open Chapter 4. Reconstruct the seven events using timestamps and source references.
3. Review the physical/authorized snapshot, pin the relevant evidence, select scoped immediate actions and construct a safe recovery order.
4. Confirm the affected account/session, use a hint, submit the plan and verify 20 raw Chapter 4 points and Final Verdict becoming current. With one hint, A finishes at 87 and B/C at 82.
5. Refresh and logout/login to verify saved progress. Ctrl+C stops only the owned demo server and removes only its uniquely created temporary directory. Existing `.env` and project data are untouched.

The Windows runner owns Ctrl+C input to perform cleanup before npm terminates the process tree. If a crash leaves a `ghost-inbox-demo-*` folder under OS temp, inspect the exact path and ensure its demo process has stopped before removing only that folder. Never delete a computed project/database directory or reset the real database to clean up a demo.

```powershell
npm run lint
npm run typecheck
npm test
$env:GHOST_DB_TEST='1'; npm test; Remove-Item Env:GHOST_DB_TEST
npm run test:e2e:containment
npm run build
```

Fast tests verify all three variants, exact prior facts, malformed/destructive plans, score/hints and all 720 permutations of the six recovery steps. The opt-in suite uses a fresh temporary database and exercises real prior-chapter completion, physical Insider unlock, deadline/cooldown enforcement, isolated fallback access, duplicates/concurrency, score persistence and unchanged earlier progress/fragments. Its separate chapter scenarios start a fresh simulated login-rate window in that disposable database so cumulative fixture logins do not exhaust the existing 15-minute authentication limit; production authentication behavior is unchanged.

`test:e2e:containment` runs every preserved routes/Inbox, Trail, Insider and Insider-restart case before the new Containment workflows and a second separate-process Containment restart. All use one disposable database; new teams are added between suites without replacing earlier teams/fragments. PDFs/screenshots live under ignored `test-results/containment-main`. The existing Insider PDF/mapping outputs stay under `test-results/insider-main`. Do not publish generated credentials or local databases. Check actual A4 dimensions, text-to-variant mappings, margins, absence of response solutions and rendered page appearance; browser print success alone is insufficient.

Expected completion budget: roughly 2 minutes briefing/physical clue, 3 minutes reconstruction, 4 minutes containment/recovery reasoning, 2 minutes evidence check and submission, 1 minute review. **No real student timing, physical placement/distribution or full 40–50-team event load has been validated.** The 12-minute estimate requires a supervised rehearsal.

## Verification on November 17, 2026

- ESLint, TypeScript and the production build passed. The default Vitest command passed 70 fast tests and explicitly skipped 22 opt-in database tests; the separate `GHOST_DB_TEST=1` run passed all 92 tests with no skips.
- Real Chromium passed all 26 cases: 7 routes/Inbox, 5 Trail, 6 Insider, 1 Insider restart, 6 Containment and 1 Containment restart. Existing Insider workflows now also open Containment after actual Insider completion. A/B/C exercised all three accepted recovery orders, incorrect chronology/recovery/session rejection, throttling, keyboard controls, hints, score recovery and historical access. No browser case was skipped in the full pipeline.
- Exhaustive unit verification accepted exactly 3 of 720 recovery permutations. Integration tests played every prior chapter through the actual server service, including physical Insider unlock, before awarding 20 Containment points exactly once under concurrent submissions. Saved scores were A 87, B 82 and C 76, reflecting their starting bonus and one/one/two Containment hints.
- The browser regression caught and verified a fix for Next.js `$ACTION_` form metadata: framework fields are removed before strict organizer-request validation, so legitimate fallback requests succeed while arbitrary user fields remain invalid. The browser's real form submission covers this path. Organizer sessions are reused within the serial Containment browser workflow instead of creating unnecessary logins that would exhaust the existing authentication rate window.
- Generated PDFs contained all three variant sheets on exactly 3 A4 pages and a B-only reprint on exactly 1 A4 page. Text and geometry checks verified margins, capture time, device, employee assignment and custody references, absence of another variant on a selected page, and absence of response IDs/order keys or Insider fragments. All variant renders were visually inspected; independently rendered pages were used to avoid a PDF-renderer font-cache artifact. No physical distribution or student rehearsal occurred.
- Desktop and 390-pixel mobile layouts were visually inspected, with no horizontal overflow. Connection interruption/recovery preserved the in-page plan. Page-local drafts reset on full reload as documented; trusted game progress and fallback authorization survived refresh, logout/login and an independent server restart.
- `demo:containment` was separately started and completed in Chromium: organizer sheets/accessibility grant, team login, seven-event ordering, scoped immediate decisions, recovery, hint, 20 raw points, score 87 and Final Verdict current. Ctrl+C removed its owned temporary folder and stopped its local server; no other project data was removed.
- Sixteen production client JavaScript chunks contained none of the tested trusted answer/fixture markers or any of the 100 generated Insider fragment values. All 20 production route dependency traces excluded Prisma CLI, `@prisma/config` and `deepmerge-ts`. Combined with source import review, no game-request path to the vulnerable tooling was found. The refreshed audit still reports the existing three high findings; no dependency upgrade or override was performed.
- SHA-256 fingerprints and row counts for all eight original development tables, including `InsiderAccess` and migration history, matched before/after testing, the interactive demo and the build. No migration or seed ran against that database. The earlier Inbox/Trail/Insider fixture keys, fragment generation/printing helpers, shared engine/service, Prisma schema/migrations and lockfile are unchanged from Phase 4.

Changed areas are the Containment server fixtures/validator/access helper, protected page/API, organizer print/fallback action, typed evidence, participant workspace/CCTV component, shared chapter-hook/navigation/login integration, demo scripts, tests and operator documentation. No Final Verdict implementation or Round 2 code was added.

## Phase 6 requirements

Implement Final Verdict at index 4 using the shared round and existing 15-point cap. Define evidence-backed variant conclusions and the end-of-round/qualification review without changing earlier keys, fragments, deadlines or bonus rules. Preserve historical access and authorized copy audit history. Before event deployment, complete student timing, physical clue and accessibility rehearsals, hosting persistence/concurrency checks and the planned dependency remediation. Final Verdict and Round 2 are not implemented in Phase 5.
