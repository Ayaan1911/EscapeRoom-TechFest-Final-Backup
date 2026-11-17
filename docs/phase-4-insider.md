# Phase 4: Insider — The Evidence Wall

This records the Phase 4 delivery. Containment is now implemented in [Phase 5](phase-5-containment.md); pending-content statements below describe the earlier phase.

Chapter 3 is playable at `/play/insider` after Trail completion. Validator index 2 awards 25 raw points through the existing engine. Inbox, Trail, participant sessions, the shared 60-minute clock, ranking, audit history, hint deductions and the single global +5 Tamper Alert retain their existing rules. Containment becomes the current chapter after completion; its content is not implemented.

## Gameplay and evidence

The stolen employee account is a victim identity, GHOST_404 is an external attacker alias, and the insider is a separately supported internal accomplice. Each fictional A/B/C dossier has six suspects and 26 stable records: six badge/console receipts, seven policy commands, five messages, three approvals, four chronology records and one custody receipt. Domains use `.example`; prior chapter IPs remain documentation addresses. No evidence link performs an external attack or collects credentials.

The variants change the responsible employee, policy/action IDs, authoring device and corroborating records while keeping equal evidence counts, reasoning and scoring. The pre-incident policy diff removes current-device attestation for an existing-session customer export, cites an approval that only authorized maintenance, and contradicts a later denial. Journaled instructions and individual console receipts establish intent and opportunity; the custody receipt links the device and individual key to its assigned employee. The other employees have independently retained ordinary commands, narrow approved scopes, lack of write privileges or later maintenance activity that reasonably eliminates them. Custody is a fictional sealed record, not a real cryptographic certificate.

The workspace provides suspect profiles, full-text search, record-type and employee filters, chronological record inspection, provenance, evidence-ID copying, a pinned notebook and structured conclusion. Search and notebook pins belong to the open page; unlock, released hints, scores and completion persist on the server. Teams must name the employee and policy command and provide the three corroborating IDs establishing intent, console timing and approval contradiction. Additional directly related custody/interview/timeline IDs are accepted. Prose is optional and is not keyword-scored. Unknown fields, client points, duplicate IDs and mixed-variant conclusions are rejected.

Suggested 15-minute flow, not yet measured with students:

1. Spend 2–3 minutes matching the envelope and wall card to the exact team ID.
2. Spend 3 minutes reviewing staff privileges and the incident chronology.
3. Spend 6 minutes comparing the policy diff, original approval, instruction and console/custody receipts; eliminate the ordinary staff actions.
4. Spend 3–4 minutes pinning corroborations and submitting the supported conclusion.

Hints are available before physical unlock. The first costs 3 points; the second costs 6 additional points. This chapter deliberately adds no planted AI instruction or bonus claim. Teams retain an earlier +5, and cannot earn an additional +5 here.

## Persistent fragments and security

`InsiderAccess` stores one row per registered team, with independently random 96-bit A and B values, unique indexes, a team foreign key and a nullable unlock timestamp. The administrator's print helper creates missing rows with an upsert and never rotates existing pairs. Reprints, service restarts and fresh sessions therefore use the same values. Unknown team IDs produce no cards or access records. Narrative variants do not determine fragments; two teams on variant A receive independent pairs.

No new environment variable is required. Existing `DATABASE_URL`, organizer access hash and origin/session safeguards still apply. Keep the SQLite file and its backups private: fragments are stored in plaintext for authorized reprinting. Database access or organizer-session compromise exposes both pieces. Restore the matching database backup to recover existing printed pairs; recreating an empty database makes old cards invalid. There is no reset/rotation UI in this phase. If a pair is compromised during an event, use the established organizer incident procedure; do not improvise a database reset or public reprint of private A slips.

Only an administrator can prepare `/admin/insider-kit`. Each response contains one part, A or B, never both. Participant HTML and client bundles contain neither stored fragment nor preloaded locked dossier. `/api/game/insider` requires the team's session and completed Trail; before physical unlock it returns only `{unlocked:false,dossier:null}`. A valid `POST /api/game` with action `unlock`, chapter 2 and both fragments persists the timestamp and an audit event. Fragment attempts are not stored in submission answers. Comparisons use normalized, hashed constant-time equality; malformed values are rejected. The existing persisted three-second per-team/chapter submission cooldown covers unsuccessful unlocks and conclusions, including across restarts. Serializable transactions prevent duplicate unlock audit/score awards. Origin checks, request limits and strict schemas remain in force.

Refresh and logout/login preserve access. A historical unlocked dossier remains readable after completion or round expiry; a sealed dossier never becomes readable merely because the round ended or an organizer skipped the chapter. Organizer progression overrides remain audited, award zero raw points, and do not forge a physical unlock. Final conclusions require the legitimate saved unlock on the server. Sharing or photographing a team's envelope still compromises that team's physical factor; this is an escape-room access mechanism, not identity proof or protection against collaborators willingly sharing their work. The shared narrative of same-variant teams can also be shared after unlock.

React renders all evidence as text; no HTML injection or external navigation is used. Only unlocked server responses carry dossier material. Preserve the server-only module boundaries in later phases.

The November 17 audit reports three high-severity findings along one dependency chain: `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`. The underlying [GHSA-ggr8-5vv4-36mx / CVE-2026-40345](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) concerns stack exhaustion when recursive object graphs are merged; ordinary JSON does not create those cycles. The library patch is in deepmerge-ts 8.0.0. npm proposes Prisma 7.10.1, a major upgrade, rather than a compatible Prisma 6 fix. Keep untrusted executable configuration out of build/migration tooling and plan a tested Prisma/client upgrade with its required configuration changes. Do not use `npm audit fix --force` or force a transitive major override without compatibility testing. The application does not import these tooling modules; production trace review is part of the verification below. This does not make the installed tooling advisory disappear.

## Printing and volunteer operations

1. Sign in as organizer and open **Print Insider Evidence Wall kit** from `/admin`.
2. Select **Fragment A - PRIVATE envelope slips** and prepare all registered teams or selected checkboxes. Use the browser Print button, A4, actual/default scale, with browser headers/footers disabled. The layout uses 12 cards per page with 12 mm margins.
3. Cut A slips and seal each in the envelope bearing exactly the same team ID. Give envelopes only to the matching registered team. Never display A sheets or complete pairs on the wall.
4. Prepare **Fragment B - PUBLIC Evidence Wall cards** separately. Only B values appear in that response and printout. Sheets group cards into five stable wall sections A–E, sorted by team ID within a section. Place clear large section labels and a team-ID index at the entrance; every A slip states its section.
5. For 40–50 teams, distribute sections across five accessible wall areas, use one collecting representative per team, keep routes clear and stagger release briefly if necessary. Assign a volunteer to each busy area and keep a separate reprint/help queue. Reprint the identical B set at another station to reduce queues; no new values are generated.
6. A missing B card can be reprinted by selecting only that team and B. For a lost envelope, verify team identity through the registration roster, select only that team and A, then hand the private slip directly to its representative. Do not read a complete pair aloud or post it in a shared chat. Keep spare private A slips and discarded sheets secured; close the organizer session on shared PCs.

The organizer's print controls and registered-team list are hidden in print media; one A4 page never combines public and private parts. Use the part labels rather than wall-section letters to distinguish A/B fragments: a public B card may belong to wall section A. Browser-generated PDFs and visual render checks verify layout and mappings. Actual printer output, physical placement, congestion and envelope distribution still require an on-site rehearsal.

## Database deployment without reset

The additive migration `202611170002_insider` creates only `InsiderAccess` and its indexes/foreign key. It does not alter existing team, session, submission, round or audit rows. Back up the existing database, stop users writing during deployment, run `npm run db:generate` and `npm run db:migrate`, and verify existing data before reopening. Never use `migrate reset`, seed an event database with demo teams or replace the event database with a temporary demo file. For multiple stateless instances, resolve the existing SQLite deployment limitation before hosting; use persistent storage and an appropriate database migration plan.

## Reproducible demo and checks

Run `npm run demo:insider` on an unused local port 3000. It creates a new temporary SQLite database with all migrations, an active round and `INSIDER-01` / `02` / `03` on variants A/B/C, each with Inbox and Trail complete. The console prints a randomly generated **demo-only** access code for those teams and the demo organizer. Team 01 already has the global +5; the others do not. The real `.env` database is never reset or seeded. `DEMO_ORIGIN=http://127.0.0.1:3001` may select another unused local port if needed.

As demo organizer, prepare private A and public B separately; match the printed team ID, sign in as that team, open Insider, combine its pieces, investigate and pin evidence, submit a supported conclusion, and verify saved score and Chapter 4 status. Ctrl+C stops the owned server and removes only the uniquely created temporary directory. A crash may leave a `ghost-inbox-demo-*` directory under the OS temp directory; inspect the exact path and ensure no demo server is using it before deleting that directory. No real fragments or database files belong in Git.

Verification commands:

```powershell
npm run lint
npm run typecheck
npm test
$env:GHOST_DB_TEST='1'; npm test; Remove-Item Env:GHOST_DB_TEST
npm run test:e2e:insider
npm run build
```

`test:e2e:insider` first runs the preserved routes/Inbox suite, then Trail, then the new Insider workflows, then a separate server process to verify persistent unlock, score and all 50 reprints. Every suite uses one disposable database; later fixtures are seeded only into that database. Real Chromium PDFs and screenshots are ignored under `test-results/insider-main`, including a demo-only mapping manifest used for restart/print verification. Do not publish those manifests as event credentials. Opt-in database tests similarly use a fresh OS temporary database and clean it up. Fast tests deliberately skip that suite unless the opt-in flag is set; run the opt-in command separately to execute it.

## Verification on November 17, 2026

- ESLint, TypeScript and the production build passed.
- Fast Vitest: 58 passed; the 17 database tests were explicitly skipped in the default command and then executed with `GHOST_DB_TEST=1`. That run passed all 75 tests with no skips.
- Real Chromium: 7 routes/Inbox + 5 Trail + 6 Insider + 1 separate-process restart test passed (19 total, no skips).
- Fifty independently provisioned same-variant database teams retained 50 unique A values and 50 unique B values. All 2,450 wrong-team A/B combinations were rejected by the server verification helper; legitimate mappings and all reprints survived reconnects. Unit tests additionally rejected other teams' complete pairs. Actual service and browser flows verified team-session isolation, wrong/mixed fragments, persisted throttling and A/B/C progression.
- The browser organizer workflow generated a separate set of 50 demo mappings. Actual PDFs contained the exact matching team ID immediately above each code: 50 A slips on 5 A4 pages, 50 B cards on 6 A4 pages, and one B reprint on 1 A4 page. Text/geometry checks verified every value, 12 mm margins and absence of the opposite part; rendered pages were visually inspected. No physical distribution was tested.
- A/B/C completion retained final scores of 67 / 62 / 56 from their distinct starting bonus/hint states, exactly 25 raw Insider points, and current chapter index 3. Concurrent integration requests produced one unlock audit and one accepted completion per team.
- The interactive `demo:insider` command was also started, its three ready teams and distinct A/B cards checked in Chromium, and a physical unlock completed. Ctrl+C stopped its server and removed its owned temporary database.
- Fifteen production client JavaScript chunks contained none of the tested server-only answer/dossier markers or any of the 100 demo fragment values. All 17 production route traces excluded `prisma` CLI, `@prisma/config` and `deepmerge-ts`. Combined with source import review, no game-request path to that vulnerable tooling was found; installed tooling still requires remediation.
- The local development migration was backed up using SQLite `VACUUM INTO`. Counts and SHA-256 fingerprints of all six existing data tables were identical before/after migration; the new access table was empty. The ignored local backup is `prisma/backups/before-insider-1794874994551.db`. Do not publish it. Inbox/Trail fixture files, the score/timer engine and package lockfile remained unchanged from the verified Phase 3 base.

Changed implementation areas: `prisma/schema.prisma` and its additive migration; `src/lib/game/insider*.server.ts`, validator registration and game service; `/admin/insider-kit`, `/api/game/insider`, `/play/insider` and existing game/login integration; the Insider workspace, shared hook/navigation/CSS; the temporary demo runner/package scripts; independent answer fixtures and unit/database/Chromium suites. README and this guide provide the operator handoff.

## Phase 5 handoff

Implement Containment at index 3 using the existing sequential engine, shared timer and scoring policy. Define its fictional actions and variants without changing earlier answer keys or the persisted Insider access. Preserve read-only evidence routes, organizer audit and the global bonus cap. Final Verdict and Round 2 remain outside this phase. Before event deployment, rehearse printed distribution, time student investigations, confirm hosting persistence/concurrency capacity and address the tracked Prisma tooling advisories through a planned compatible dependency update.
