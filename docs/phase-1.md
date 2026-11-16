# Phase 1: local engine

The Phase 1 engine was verified and pushed at `bb052a8`. The later [Chapter 1 handoff](phase-2-inbox.md) documents the playable Inbox, isolated demo and expanded verification; this document describes the original engine foundation.

## Setup on a machine with network and Git write access

Use Node 22.18+ LTS (the seed reads TypeScript with Node's native type stripping). The inspected environment has Node 25.2.1 and npm 11.6.2.

1. Run `npm ci` using the checked-in lockfile, then `npm run db:generate`. Network and build/Git operations may require supported environment approval.
2. Copy `.env.example` to `.env` without replacing an existing `.env`.
3. Run `npm run auth:hash`. It reads an organizer code using hidden PowerShell input and stores only its salted scrypt hash in ignored `.env`; the code is never printed. Use at least 12 characters. `.env` remains private.
4. Set a private `DEV_TEAM_CODE` (12–256 characters) and `DEV_TEAM_COUNT` in `.env`. The development seed uses IDs DEV-001 onward and preserves existing records and hashes. All these test teams share the supplied development code. Never use this seed for competition credentials.
5. Run `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed`. Migrations create the local database in `prisma/dev.db`. The seed refuses production mode and accepts up to 100 test teams.
6. Run `npm run dev`. Visit `/login` for teams and `/login?role=admin` for organizers.

Keep `APP_ORIGIN` equal to the actual origin. Production sessions require HTTPS. No default organizer credential exists. Restart the server after changing environment values. Session tokens are random, stored only as SHA-256 digests in the database, expire after 12 hours, and are deleted on logout. Failed login attempts are limited to ten per identity per 15-minute window; unknown team IDs are also throttled. Changing a code does not revoke existing sessions: remove affected TeamSession records when rotating a compromised code.

## Persistence and deployment

SQLite is a temporary local development choice because no PostgreSQL service was supplied. Prisma is isolated in `src/lib/db.ts`, `auth.ts`, and `game/service.ts`; pages call services rather than embed database rules. Team chapter progress is one validated JSON string updated within serializable transactions, so scoring, hints, completion and bonus are persisted together. Submission rows retain attempts, answers and rejection reasons. AuditLog records hints, round controls and manual unlock reasons. No local database or `.env` is tracked.

Before hosting, migrate to PostgreSQL: change the Prisma datasource, generate a new PostgreSQL migration baseline, transfer and validate existing data, and rerun integration and concurrency checks. SQLite files are not suitable for stateless multiple-instance deployment. Back up the local file before any migration. A single-instance local load test with 50 teams is still required; no load test has run.

## Round and scores

One shared round row defines the server start, one-hour deadline and optional early end. It cannot be restarted. The effective state automatically becomes finished at the deadline even without browser activity. Submission checks use server time inside the transaction; refresh never creates a new round. Client countdowns use monotonic elapsed time and poll the server every five seconds. The displayed clock is informational; server checks always decide whether an action is allowed.

Five sequential stages have caps 15/25/25/20/15. Hints cost 3 then 6 additional points in each stage, with two maximum. The Tamper Alert bonus is 5 once per team, awarded only by a trusted validator. Total score is floored at zero. Admin unlock marks the current stage completed with zero points, records the reason, and only works during an active round. No browser request accepts a score or team ID for participant actions.

Rank by total score, combined gross Chapter 2 + 3 score, fewer hints, then earlier final completion. Null completion timestamps sort last; team ID breaks exact ties deterministically. The first ten are qualifiers and the next two standbys. During an unfinished round selection is provisional. Ranking and CSV export do not mutate progress.

## Routes

- `/login`: team or organizer login; `/play` and `/admin` redirect unauthenticated users here.
- `/play`: own team snapshot, countdown, chapter statuses, score, hints and evidence placeholder.
- `/admin`: authenticated round controls, all teams, stage scores, hints, qualification, manual unlock and recent audit events.
- `GET /api/game`: own session-derived team data only, never credential hashes.
- `POST /api/game`: strict `{action: 'submit' | 'hint', chapter: 0..4, answer?: unknown}`; session and same-origin checks, bounded payload, active-round/progression checks. Unimplemented stages return 409 and record the attempt.
- `GET /api/admin/scores`: organizer-only CSV, with spreadsheet formula escaping.
- Login, logout and organizer control use Next server actions with server authorization and framework origin protection. All admin endpoints enforce access server-side.

## Tests

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Vitest only collects `*.test.ts`; Playwright only collects `*.spec.ts`. Vitest uses worker threads because child process creation is restricted in this environment.

Database integration tests are explicitly enabled after client generation: in PowerShell, `$env:GHOST_DB_TEST='1'`, then `npm test`. They create a fresh temporary SQLite database, apply the checked-in migration, exercise session login/revocation, protected APIs, saved state, round control, hints, bonus, duplicate rejection and overrides, then remove that temporary database. They never use the development database. The expanded suite now has seven opt-in cases. Test-only validator fixtures are never registered by the application.

Run `npm run test:e2e` separately. If Chromium is absent, run `npx playwright install chromium` once. Set private `GHOST_E2E_TEAM_ID` and `GHOST_E2E_TEAM_CODE` in the test runner environment to enable the authenticated browser refresh/logout test; otherwise it explicitly skips. `npm run test:e2e:inbox` now supplies isolated temporary fixtures for the full browser suite. Multi-team load verification remains outstanding.

## Phase 2

Implement fictional evidence and trusted server validators in `src/lib/game/validators.ts` for each stage and final verdict. Add chapter-specific input schemas, actual hints and Tamper Alert detection, chapter routes and submission controls, and authenticated browser tests for real investigation flows. Confirm score visibility with event organizers. Provision real teams with independently generated private codes through an organizer provisioning process before the competition. Add PostgreSQL deployment, concurrency testing, backup/restore and operational monitoring before hosting.
