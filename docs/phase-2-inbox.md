# Phase 2: The Inbox

Trail is now implemented in the subsequent [Phase 3 handoff](phase-3-trail.md). The rest of this document records the Inbox chapter and its original delivery scope.

Chapter 1 is a playable, fictional NEXUS Corp investigation. It branches from verified Phase 1 commit `bb052a8`; it does not require a schema migration. Trail, Insider, Containment, Final Verdict and Round 2 remain unimplemented.

## Participant flow and acceptance criteria

Sign in at `/login`. The shared dashboard polls for the organizer's start and then opens Chapter 1 at `/play/inbox`. Direct access to the inbox and forensic snapshot is also blocked while the round is waiting. Started cases remain available for read-only review when completed or expired.

The workspace contains six selectable emails with read/unread styling, addresses, UTC timestamps, message bodies, inert destinations, attachment metadata and expandable headers. A delivery ledger, navigation record, two identity-provider events and two database audit events provide the corroboration. All material uses `.example` destinations and documentation-only IP addresses. No evidence URL is a clickable external destination.

The scenarios are security operations, payroll, project collaboration, supplier documents, an account alert and an employee archive request. Each variant changes the investigator, campaign, incident session, breach message and the positions of the matching identity/database records. The three correct messages occupy different inbox positions. Suspicious quarantine, forwarding and account-alert evidence provides alternative suspects; the authorized archive export is a separate event. The initial compromise is the one message linked by navigation, captured redirect, sign-in session and first unauthorized export. Display names, urgency and SPF status alone are insufficient.

Submit structured email, navigation, capture, authentication and database evidence IDs plus the correlated session identifier. A short explanation is optional and never keyword-scored. Surrounding whitespace on copied evidence IDs is accepted. The server requires the entire matching chain for the assigned team variant; malformed or unsupported conclusions receive a generic rejection without identifying a wrong component. No client can choose its team, variant or points. Failed conclusions cost no points.

## Scores, hints and Tamper Alert

Correct completion awards 15 raw chapter points and advances the shared engine to Chapter 2. Hint one costs 3; hint two costs 6 additional points. Released hints are reconstructed from the saved hint count and remain visible after refresh or login. At most two are available. Total score remains floored at zero, with the existing overall ceiling of 105.

One recovered text attachment contains explicitly labeled attacker-controlled instructions aimed at an AI assistant. It is evidence, never an instruction to the application or a trusted investigation summary. The Tamper Alert form requires the matching message, attachment and manipulation technique. Claim it before submitting the final conclusion. It is optional and independently validated: a wrong but well-formed conclusion can still earn the bonus if it includes a valid Tamper Alert, and the UI supports a standalone Tamper Alert submission. A correct breach answer alone never awards the bonus. The +5 is saved once per team and audited; repeated and concurrent requests cannot farm it.

Chapter 1 therefore yields 15 without hints or bonus, 20 with the bonus and no hints, 17 with the bonus and one hint, or 11 with the bonus and both hints. Hint deductions are applied by the existing engine, not client arithmetic. Round start, deadline, sequential access, organizer overrides and duplicate completion checks remain server-authoritative inside serializable transactions.

Submissions have a persisted three-second cooldown per team/chapter, backed by existing submission timestamps. Rapid retries return HTTP 429 with `Retry-After`; rejected throttled retries do not extend the cooldown. Hints retain their existing two-use cap. This slows automated guesses without an accumulating lockout. It is not protection against credential sharing or collaboration between participants.

## QR evidence and printing

The organizer-only `/admin/inbox-kit` page generates a real PNG QR locally with a four-module quiet zone and medium error correction. Print it with the page's print button. The QR targets `<application origin>/clue/inbox`; the manual fallback is the same short path. One physical card works for all teams because the server resolves the variant from the authenticated session. Query parameters cannot change it.

The snapshot requires a team session and a started round. Its login redirect preserves only the explicitly allowlisted Inbox destinations. The reconstructed page contains no form, input, iframe or live destination. It shows the original URL, campaign, redirect, recipient, timestamp and form action as inert text.

Set `APP_ORIGIN` to the exact deployed HTTPS origin. The print page defaults to that value, or the organizer can enter the reachable application origin for the printed card. It rejects loopback URLs, URL credentials, paths, queries, fragments and public HTTP origins; private LAN HTTP addresses are allowed for local demos. Printing a different origin does not reconfigure the application or deploy it. The organizer must verify the actual host is reachable from a participant phone before distributing cards. No deployment origin was supplied or deployed as part of this implementation.

## Reproducible demo without touching development data

From the project directory, run `npm run demo:inbox`. It creates a new database under the OS temporary directory, applies the checked-in migration there, creates `DEMO-A`, `DEMO-B` and `DEMO-C`, and prints a random demo-only access code for those teams and the organizer. It overrides database/auth/origin values only for the child process; existing `.env` and development data are untouched. Node 22.18+ is required for the seed's native TypeScript stripping.

1. Open the printed organizer URL in a separate browser profile/private window and sign in with the generated code. Start the 60-minute round.
2. Sign in as a demo team with the same demo-only code. Open Chapter 1.
3. Inspect the six emails and logs. Open `/clue/inbox` or use a printed card with a reachable origin.
4. Request hint one. Identify and optionally record the planted manipulation before completing the chapter.
5. Submit the complete evidence chain. Organizer-only automated expectations are in `tests/fixtures/inbox.ts`; do not distribute source/test fixtures to competitors.
6. Confirm raw chapter score 15, total score 12 after one hint or 17 after one hint plus the bonus, and Chapter 2 unlocked. Refresh, log out/in, or reopen the browser to confirm saved state.
7. Press Ctrl+C in the demo terminal. The spawned server is stopped and that temporary database is removed. Each new demo starts fresh; no existing round is reset.

For phones on the same network, first set `$env:DEMO_ORIGIN='http://YOUR-LAN-IP:3000'`, then run `npm run demo:inbox`. Use the computer's actual private IPv4 address; both devices must be able to reach it. The runner binds to that address and sets the matching origin. It changes no firewall or security settings. For a hosted event use HTTPS and a production build, not the development server.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Enable integration tests separately with `$env:GHOST_DB_TEST='1'` and `npm test -- tests/database.test.ts`; they use another fresh temporary database. Default Vitest deliberately skips the seven opt-in database cases.

Run `npm run test:e2e:inbox` for the complete real Chromium suite. It bootstraps temporary A/B/C fixtures and generated credentials, starts the existing Playwright-configured test server, runs the tests and removes its temporary database. If Chromium is absent, install it with `npx playwright install chromium`. Plain `npm run test:e2e` remains available for a configured development environment; without the demo variables the four isolated Inbox cases and the credential-dependent legacy case visibly skip.

Coverage includes all three variants, unique supported conclusions, schema/evidence rejection, hint caps and persistence, independent one-time bonus, concurrent duplicate submissions, before-start/locked/expired rejection, origin enforcement, throttling with HTTP 429, refresh/login/reopened-context persistence, temporary connection recovery, automatic Chapter 2 progression, admin access, query-variant isolation, no credential inputs on the forensic page, and decoding the actual rendered QR pixels. Browser screenshots are written under ignored `test-results/` for desktop/mobile layout review.

Before delivery, inspect `.next/static/chunks` to confirm server fixture/validator identifiers and deterministic case campaign constants are absent. The server-only import guard causes a production compilation error if a Client Component imports the fixture/validator module. Participant serialization includes evidence only; the capture manifest is sent only on its authenticated page. The public game-state response contains no answer keys or credential hashes.

Verified on November 17, 2026: ESLint, TypeScript and the elevated production build passed; 24 fast tests passed, all seven database integration tests passed separately, and all seven Chromium cases passed with zero browser skips. The production output check passed across 12 client JavaScript chunks and 11 route traces. The rendered QR was decoded from browser pixels. Desktop/mobile screenshots were reviewed, including a 390-pixel viewport without horizontal overflow. The interactive Windows demo returned HTTP 200 and its Ctrl+C shutdown was verified to stop the server and remove its temporary database. A physical phone scan against the final event host has not been performed.

## Security and known limits

No production data is reset, no real email is sent, and no credential collector or external redirect is implemented. The Prisma schema and credential handling are unchanged. Optional answer prose stays in the existing authenticated submission record; it is not treated as an instruction. Read markers, selected message and unfinished form contents are temporary browser UI state; scoring, paid hints, bonus and completion are persisted only on the server. Connection loss preserves the current form while the page remains open and polls saved state when connectivity returns.

The existing high-severity `deepmerge-ts` advisory through `prisma → @prisma/config` is a separate dependency issue. Prisma remains 6.19.3; no forced override or major upgrade is included. Phase 1 found no production request path to that tooling chain, but npm's production-only audit still reports it through the optional Prisma peer. Keep CLI/config tooling out of the deployed runtime artifact where possible and plan a separately tested compatible fix or coordinated Prisma/client upgrade. Audit findings are not declared resolved by this chapter.

Anyone with repository access can inspect server fixtures and test expectations. Keep event source access restricted until the competition ends. The API/bundle boundary prevents participant web access to keys; it cannot conceal keys from repository collaborators. Fifty-team load/concurrency validation, production hosting and physical phone scanning against the final deployed origin remain separate operational checks. SQLite remains a single-instance development choice.

## Phase 3 handoff

Implement Trail at registry index 1 using the established server-only validator/evidence pattern and its own equally tested variants. Build its investigation interface, trusted input schema and hints without altering Chapter 1 awards or resetting saved teams. The engine already unlocks Trail after Inbox completion; its content is intentionally pending. Do not implement Insider, Containment, Final Verdict or Round 2 as part of this chapter.
