# Phase 3: Trail

Trail is playable at `/play/trail` on the verified Phase 2 branch base `471cb669e641962dd8c4e34ea80a3d964551efc0`. It uses validator index 1 and the existing shared round, serializable transaction, score engine, three-second submission cooldown and global Tamper Alert. No schema change or new dependency is required. Inbox fixtures and its answer keys are unchanged. Insider, Containment, Final Verdict and Round 2 remain unimplemented.

## Investigation and continuity

Each A/B/C case has 144 deterministic fictional identity-provider events and eight supporting forensic artifacts. The 12 dataset columns are event ID, timestamp UTC, account, source IP, event type, result, authentication method, device, session ID, conditional-access decision, correlation ID and event details. All accounts use `nexus.example`; all IPs are within the documentation-only 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 ranges. No geolocation or external reputation is invented.

Inbox already established a suspect identity, campaign, incident session and export. Trail requires teams to reconstruct the original session issuance and later validation among normal activity and decoys, then connect that chain to the retained capture and unauthorized export. An account or IP copied from Inbox alone cannot complete Trail. The intended investigation budget is around 13 minutes; this target still needs student play-testing and is not an experimentally measured completion time.

Trail derives the principal, source, session, campaign, capture and database audit from the existing server-only Inbox fixtures. A/B/C retain their distinct employees, campaigns and sessions and use different event IDs for issuance, later validation and the planted note. Their incident source IP is deliberately the same because that is what all three verified Inbox cases establish. There are equal row counts, column sets, decoy types, acceptance requirements and point caps. Cross-chapter tests assert exact account, source, session, campaign, database operation and timestamp agreement, including issuance before capture before later validation before export.

Four decoys have documented elimination evidence:

- Repeated failed-password attempts produce no authenticated session, despite their high count.
- A registered employee VPN uses FIDO2 and an approved gateway/device combination.
- Maintenance changes source IP and reuses a session, but a change record authorizes its device, time window and `maintenance_manifest` export. That does not authorize the incident's `customer_directory` export.
- An unrelated account has a suspicious successful password event, but its restricted session is revoked before database access and has no export.

The compromised employee also has a separate legitimate managed session. Teams must distinguish principal identity from exact session identity and compare the later event's source/device with the original issuance. The database audit and policy/device records make the single supported conclusion defensible without relying on a suspicious row label or a failed-login heuristic.

## Workspace

The SOC-style workspace offers case-insensitive search across every field; account, IP, result, type and exact-session filters; ascending/descending timestamp order; 25-row pages; full-event inspection; related-session filtering; evidence-ID copying and pinning; a complete CSV download; and the supporting audit/capture/device/change/revocation records. Clipboard denial has a manual-copy fallback. Selecting a row can populate the conclusion's account, source, session and event fields, but never selects a server-designated solution automatically.

The dashboard links Inbox and Trail when allowed. Inbox remains readable after completion. Trail opens only after Inbox completion or an audited organizer override and a started round. Locked pages redirect to the dashboard; locked JSON and CSV return 403, and anonymous or wrong-role requests return 401. The page, JSON and CSV share one server authorization function. All variants come from the team session; query-string team or variant selectors are ignored. Started, unlocked historical evidence remains readable after completion or round closure; mutation is still denied by the engine.

Both chapters now use the same extracted `useChapter` hook for saved-state polling, the display of the server's shared deadline, submission feedback, reconnect behavior and cooldown display. No second round timer or scoring system was added. Unfinished filters, selected records and drafts are temporary view state. Authoritative progress, paid hints, bonus, completion and the submission timestamps are persisted on the server. A temporary connection interruption preserves the open form and recovers saved state when connectivity returns.

## Trusted answers and scoring

`POST /api/game` is unchanged: `{ action: 'submit' | 'hint', chapter: 1, answer? }`. Trail conclusions are strict Zod objects containing `kind: 'conclusion'`, account, IPv4 source, incident session ID, relevant authentication event ID, exactly three unique supporting evidence IDs and an optional explanation of at most 800 characters. The three required corroboration roles are the original session issuance event, retained browser capture and matching unauthorized database audit. Evidence order and optional prose wording do not affect acceptance. Surrounding ID whitespace and account casing are normalized.

The validator requires the complete matching chain for the authenticated variant, rejects extra client points/team/variant fields and returns a generic rejection without naming a wrong component. Correct completion awards 25 raw Trail points, applies existing hint penalties and advances current chapter to index 2. The raw two-chapter cap is 40, or 45 with the one-time global bonus; the overall Round 1 ceiling remains 105. Incorrect and throttled submissions do not unlock Insider or accumulate additional penalties. The existing persisted three-second cooldown returns HTTP 429 and `Retry-After`; throttled retries do not extend it.

Hint one costs 3 points and distinguishes denied attempts from successful access. Hint two costs 6 additional points and directs investigation toward session continuity and the database export. Neither reveals the expected account/IP. Released hints are restored from saved usage counts after refresh or login.

One event's untrusted `details` field contains a fictional analyzer-style instruction directing an AI toward the failed-password decoy. It is displayed as text, never interpreted as an application instruction. Trail Tamper Alert accepts a strict independent `{ kind: 'tamper', tamper: { eventId, field: 'details', technique: 'instruction-override' } }` submission, or optional `tamper` inside a conclusion. It can award +5 even when the main conclusion is wrong. It must be claimed before completing the chapter. If Inbox already awarded the global bonus, Trail awards zero additional bonus. Repeated and concurrent awards are protected by the existing saved progress and transaction.

## CSV and answer-key boundaries

`GET /api/game/trail` returns the assigned public evidence after authorization. `GET /api/game/trail/csv` returns all 144 log rows with the fixed 12-column schema, an attachment filename and `Cache-Control: no-store`. Neither returns expected conclusions, correctness flags, private fixture slots, auth codes or session cookies. IDs and incident sessions in the dataset are fictional evidence, not application session tokens.

CSV escaping is shared with the existing organizer score export. Every cell is quoted; internal quotes are doubled; formula-like prefixes are apostrophe-escaped even after leading whitespace or control characters. The planted note intentionally exercises this protection. No new CSV package is installed.

Fixture generation, expected solutions, schemas and validators use `server-only` import guards. Client components receive only evidence and the public saved state. Verify production JavaScript chunks do not contain fixture/validator identifiers or fixed case tokens; production build checks catch accidental client imports of guarded modules. Source collaborators can still inspect server fixtures and test expectations; keep event repository access restricted. There are no debug/key endpoints, live scans, network attacks, credential collectors or executable evidence destinations.

## Reproducible temporary demo

Run `npm run demo:trail` from the project directory. The shared demo runner creates a new OS-temporary SQLite database, applies the checked-in migration there and generates fresh team/organizer credentials. It creates `TRAIL-A`, `TRAIL-B` and `TRAIL-C` with explicit Inbox-completed demo fixtures using the existing engine and starts a shared one-hour round. These fixture completions are labeled as demo data, not real competition attempts. A already has the global bonus; B/C can earn it in Trail. Existing `.env`, development databases and saved competition progress are not modified.

1. Sign in as a printed Trail team with the generated demo-only code. Confirm Inbox is complete and open Chapter 2.
2. Search/filter the logs, inspect a session and its full events, review the supporting audits and download the CSV.
3. Request a hint and optionally record the planted manipulation before completing Trail. Use the UI's three stated evidence roles to submit a supported conclusion. Private test expectations are in `tests/fixtures/trail.ts`; do not distribute them to participants.
4. Verify 25 raw Trail points and Insider unlocked. With no Inbox hints, one Trail hint and the global bonus, total score is 42; both Trail hints produce 36. Refresh and log out/in to verify persistence.
5. Ctrl+C stops only the spawned demo process tree and deletes that temporary database. Each invocation creates fresh fixtures and credentials. A forced OS kill/power loss can prevent any cleanup handler; do not use this runner for event credentials or lasting data.

For an existing private LAN demo, set `DEMO_ORIGIN` to the reachable HTTP origin including its port before running the script. This changes only the temporary child-process environment. It does not change firewall rules or deploy the application. Production requires the normal HTTPS origin, stable database and production build.

## Verification and regression

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Enable database tests separately with `$env:GHOST_DB_TEST='1'`, then `npm test -- tests/database.test.ts`. The database suite uses a fresh temporary database and exercises real Inbox validation before Trail, paid hints, before-start/locked/expired denial, shared bonus, duplicate/concurrent attempts, persisted throttling, authorization, overrides, logout/login and Insider progression. Default Vitest visibly skips the opt-in database cases rather than claiming they passed.

Run `npm run test:e2e:trail` for Chromium. The runner first executes all preserved route/Inbox browser cases against a fresh temporary database, including real Inbox-to-Trail navigation. After that server stops, it seeds clearly labeled Trail fixtures and runs the Trail cases against the same temporary database and shared round. This sequencing prevents tests from racing the organizer start or stop. Browser coverage includes all variants, filters/sort/pagination, details and related sessions, evidence copying/pinning, actual CSV downloads, hint persistence, global bonus reuse, generic wrong-answer rejection, HTTP 429, connection recovery, historical Inbox access, login persistence and closed-round behavior. Test screenshots and CSVs stay under ignored `test-results/`.

Plain `npm run test:e2e` and `npm run test:e2e:inbox` remain available. Without the Trail fixture flag, the five Trail browser cases visibly skip. Use the full Trail command for delivery verification; do not count those opt-out cases as passes.

Verified November 17, 2026: ESLint, TypeScript and the elevated production build passed; 47 fast tests passed and all 12 opt-in database cases passed separately. The full Chromium command passed all seven preserved route/Inbox cases and all five Trail cases, with zero browser skips. Actual clipboard content and downloaded CSV bytes were checked. Desktop and 390-pixel mobile screenshots were inspected; the mobile page has no horizontal overflow. Production inspection found no server fixture/key tokens in 13 client JavaScript chunks and no Prisma CLI/config/deepmerge paths in 14 route traces. The standalone Trail demo returned HTTP 200, its three pre-completed team fixtures were asserted against its temporary database, and Ctrl+C exited successfully and removed that directory. The verified Inbox fixture, engine, scoring service, schema and dependency lockfile remain unchanged from Phase 2.

The existing three high-severity audit findings remain in `prisma → @prisma/config → deepmerge-ts`. No dependency version or forced override is changed here. Keep the previously documented tooling/runtime separation and plan a separately tested compatible remediation. Load testing with 50 teams, real deployment and student timing calibration remain operational follow-ups; SQLite is still a local single-instance choice.

## Phase 4

Implement Insider at index 2 with its own server-only evidence, trusted validator and equally tested variants. Preserve the completed Inbox/Trail records, shared deadline, scoring and global bonus. Insider is unlocked by Trail but intentionally has no challenge content yet. Do not add Containment, Final Verdict or Round 2 in this phase.
