# Hosted rehearsal runbook (PREPARED, NOT EXECUTED)

Nothing in this document has been run against a hosted service. Every hosted step below requires explicit organizer authorization of the isolated staging environment AND its budget first. Prepared artifacts: `render.staging.yaml`, `.env.staging.example`, `scripts/staging-check.mjs` (`npm run staging:check`), `scripts/staging-pooler-gate.mjs` (`npm run staging:gate`, `npm run staging:gate:local`), `scripts/load-test.mjs` (existing, fail-closed remote mode), `docs/phase6b-hosting-costs.md`.

## 0. Isolation rules (all mandatory)
- Render service `ghost404-staging-loadtest`; Neon **separate project** `ghost404-loadtest`, database `ghost404_loadtest`. Never the existing preview service or its Neon database.
- Synthetic teams only (`LT-01`..`LT-50`); a NEW organizer test code; no real credentials, no `private/` files, no real participant data.
- `autoDeploy: false`; every deploy is an explicit commit SHA recorded in the rehearsal log. No `main` merge, no production anything.
- Secrets live only in the Render/Neon dashboards and the operator's password manager; nothing is committed or printed. `.env*` stays git-ignored (only `.env.example`/`.env.staging.example` are tracked).

## 1. Preparation (local, free, repeatable now)
1. Record the exact commit SHA to deploy (`git rev-parse HEAD`); working tree clean.
2. `npx tsc --noEmit`, `npx eslint .`, `GHOST_DB_TEST=1 npx vitest run --pool=forks --maxWorkers=1`, `npm run build` all green (use the local disposable PostgreSQL only).
3. `npm run staging:check` (13 static checks of the staging files) and `npm run staging:gate:local` (the pooler gate's own logic against the local disposable database) pass.
4. Generate the NEW organizer test code and its hash: `GHOST_BOOTSTRAP_SECRET=<new> node scripts/bootstrap.mjs`; keep the code in the password manager only.

## 2. Create the isolated environment (needs authorization)
1. Neon: new project `ghost404-loadtest` (separate from the preview project), database `ghost404_loadtest`, pooled and direct connection strings noted. Choose the plan per `docs/phase6b-hosting-costs.md` (always-on compute, no scale-to-zero, min 0.5 CU, max 2 CU).
2. Render: apply `render.staging.yaml` as a Blueprint with the approved `plan`; type the four secrets in the dashboard (`DATABASE_URL` pooled, `DIRECT_URL` direct, `ADMIN_ACCESS_HASH`, `APP_ORIGIN`). Leave Auto-Deploy off; do NOT set `GHOST_TX_MODE`.
3. Apply migrations explicitly through the DIRECT url: `DIRECT_URL=... DATABASE_URL=<direct> npx prisma migrate deploy`; then `prisma migrate status` shows the 5 migrations applied and every table empty.
**PASS** = migrations applied, zero rows in every table. **FAIL** = anything else: stop.

## 3. GATE 1: per-team locking through the pooled connection (BLOCKING)
Run `GHOST_GATE_DATABASE_URL=<pooled> GHOST_LOAD_ENV=disposable-loadtest GHOST_LOAD_TARGET_DB=ghost404_loadtest npm run staging:gate`. It creates and drops only `_gate_*` tables and refuses anything that is not a loadtest database or the known preview host.
**PASS** = all five checks pass: (B) the control without a lock loses updates (the probe can see a broken lock); (A) 100 concurrent transactions with `pg_advisory_xact_lock(hashtext(team))` lose no update (every counter exactly 5); (C) `FOR SHARE` blocks a conflicting UPDATE until commit; (D) 50 parallel locked transactions with zero errors; (E) round trip.
**FAIL (release blocker)**: any check fails (e.g. (A) shows a lost update). Fallback to investigate, not to ship: redeploy with `GHOST_TX_MODE=serializable`, repeat Gate 2, and report the measured retry/failure rate for an organizer decision.

## 4. Deploy and baseline
1. Manual deploy of the recorded SHA. Record build time.
2. `GET /api/health` 200; `GET /api/health?db=1` reports `database: up`. Unauthenticated sweep: every `/api/game*`, `/api/round2/*`, `/api/admin/*` returns 401; `/admin`, `/admin/round2`, `/round2` redirect to login.
3. Bundle scan on the live URL: fetch every `/_next/static/**/*.js` and grep for answer-key identifiers (`B2_CONTRA`, `I3_TRUTH`, `tasks.server`, `explanation`, `taskTiers`), organizer text, and source maps (`*.map` must 404).
4. Cold start: leave idle 20 minutes, time the first login. **PASS** (always-on plan) < 5 s; if the plan sleeps record the time and flag it.

## 5. GATE 2: 50 teams, three participants each (BLOCKING)
`node scripts/load-test.mjs --origin https://ghost404-staging-loadtest.onrender.com --yes-remote --authorize-round-control --teams 50 --participants 3 --storm` (env per `.env.staging.example`; the DB must be empty). Run once at `--speed 4` and once at `--speed 1`.
**PASS** = 50/50 teams complete all five chapters; **0 invariant violations**; 0 HTTP 5xx; 0 duplicate awards; recovery checks (restart + relogin keeps score; submission after deadline rejected; scores unchanged after expiry) all PASS; submit p95 < 2.0 s, poll p95 < 1.5 s, login p95 < 3.0 s (local baseline at 4x: 0.8 s / 1.5 s / 2.6 s); server RSS peak < 70% of plan RAM; DB connections stay below the plan limit with `DB_POOL_SIZE=5`.
**FAIL (blocker)**: any invariant violation or duplicate award, any 5xx, any lost score, RSS above 85%.

## 6. Round 1 scoring audit and qualification
1. Compare the organizer CSV with a direct SQL sum per team (`Team.progress` vs `TaskScore`): equal for all 50. Check best-v1: `GameSession.scoringPolicy = 'best-v1'`, `Submission.scoringVersion = 3` rows only.
2. Confirm the qualification snapshot through the organizer UI. **PASS** = ten teams listed in the documented order, two standby, one audit row.

## 7. Round 2 with ten finalists
1. `/admin/round2`: enroll (10 active, 2 standby), negative promotion (refused with the server message), valid promotion, readiness all green, Start through the confirmation dialog.
2. Play the ten finalists through every incident and challenge. Compressed-time mode (recommended): the operator moves `R2Session.startsAt` through the DIRECT url on the STAGING database only (never a real clock) to reach minutes 0/7/19/26/51, exactly as `tests/phase5-round2.spec.ts` does. Optionally run one real 50-minute dry run last.
3. Verify release times (0, 6, 12, 18), Part A close at 25, Part B open, end at 50, attempt counters per tier (A=2, B=3, C=5), identical-resubmission idempotency, no unreleased content in responses.
**PASS** = no unreleased evidence ever returned; late submissions refused; scores equal the DB sums; no 5xx.

## 8. Autosave across restarts and server recovery
Mid-round: restart the Render service (manual restart). **PASS** = every draft restored (compare with DB), both clocks continue from the stored start, scores unchanged, teams reconnect without re-entering anything; recovery time < 2 min (record it). Repeat once with a forced Neon compute restart if the plan allows.

## 9. Organizer actions, ranking, ties, publication
1. Emergency end only after the round has finished is refused; end with a reason during a run.
2. Results: ranking order total > Part B > Part A time > difficulty subtotal; exact ties shared. Run the ordinary-click tie flow (`tests/organizer-ties.spec.ts` logic) against staging: acknowledge each exact tie, verify the audit row, confirm Publish is blocked until then, publish with the typed word, verify participants see shared ranks and the CSV carries the acknowledgments.
**PASS** = publication impossible with an unacknowledged tie; ranking and CSV identical; one `publish-results` audit row.

## 10. Backup and rollback
1. Backup: `DATABASE_BACKUP via npm run db:backup` against the direct url (output outside the repo). Restore into a SECOND empty database/branch and compare row counts per table: **PASS** = identical.
2. Rollback: manually redeploy the previous commit SHA; `/api/health?db=1` green; scores intact; the older build must tolerate the newer schema (additive migrations) - verify login and a submission. **PASS** within 10 minutes.

## 11. Teardown and report
Delete the Render service and the Neon project only after the results are saved (needs the organizer's go-ahead); record SHA, plan names, measured numbers, cost, and every FAIL. Release stays BLOCKED until Gates 1 and 2 pass.

## Release-blocking failures (any one)
Pooler Gate 1 failure; any scoring invariant violation or duplicate award; any lost score/draft after restart; any 5xx during the storm; results publishable with an unacknowledged exact tie; any answer key, organizer text or source map reachable from the browser; health/readiness failing after deploy.
