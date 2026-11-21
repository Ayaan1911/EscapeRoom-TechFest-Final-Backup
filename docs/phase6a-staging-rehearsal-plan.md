# Hosted rehearsal plan (PLAN ONLY: no resource has been created, no money spent)

Goal: rehearse the real event on the same stack (Render web service + PostgreSQL) in an isolated environment, with synthetic teams, before any real participant touches it.

## Isolation rules
- Separate Render service named `ghost404-staging-loadtest` (the load harness refuses origins without "loadtest") and a separate, empty PostgreSQL database named `ghost404_loadtest` in a separate project. Never the existing preview (`ghost404-round1-preview`, Neon `neondb`).
- Synthetic teams only (`LT-01`..), a separate organizer code, nothing copied from real credentials or `private/`.
- `autoDeploy: false`; deploy only an explicit commit SHA recorded in the rehearsal log. A prepared Blueprint (`render.staging.yaml`, to be written in Phase 6B after approval) would pin the branch, set `plan` per the sizing below, and list the same env vars as `render.yaml` with fresh secrets.
- No answer keys in public responses: confirm with the bundle scan (`.next/static` grep) and a logged-out request sweep on the staging URL.

## Pre-flight (before any load)
1. Build the exact commit locally (`npm ci && npm run build`), record SHA and `git status` clean.
2. `prisma migrate deploy` against the empty staging DB through `DIRECT_URL` (never the pooled URL). Record the 3 migrations applied.
3. `GET /api/health` (liveness) and `/api/health?db=1` (readiness) green; organizer login works; `ADMIN_ACCESS_HASH` generated with `scripts/bootstrap.mjs`.
4. **First test: transaction behaviour through the pooler.** Run the 50-team burst (`tests/f5-contention.test.ts` logic via `scripts/load-test.mjs --storm`) against the pooled URL. Expected: 0 failed submissions and 0 retries. This is the one unverified assumption of the F5 fix (advisory xact locks + `FOR SHARE` under PgBouncer transaction mode). If it fails, set `GHOST_TX_MODE=serializable`, re-measure, and report.

## Test sequence
1. Remote load, Round 1: `node scripts/load-test.mjs --origin https://ghost404-staging-loadtest.onrender.com --yes-remote --authorize-round-control --teams 50 --participants 3 --storm` with the documented env (`GHOST_LOAD_ENV=disposable-loadtest`, `GHOST_LOAD_TARGET_DB`, `GHOST_LOAD_DATABASE_URL`, `GHOST_LOAD_ADMIN_CODE`; never printed). Run once at `--speed 1` (realistic 5 s polling) and once with `--speed 4`.
2. Round 1 to Round 2 progression: finish Round 1, confirm qualification as organizer, enroll, start Round 2 and drive 10 synthetic finalists through all 8 challenges (extend the harness or use `tests/phase5-round2.spec.ts` with `GHOST_PHASE5` against the staging origin; time is simulated by the test database owner, not the live clock, or run a compressed real 50-minute clock once).
3. Restart/recovery: restart the Render service mid-round (`--pause-for-restart`); sessions, drafts, scores and both clocks must persist.
4. Cold start: let the service idle past its sleep window (free: 15 min) and time the first login. Do the same for the database if it scales to zero.
5. Score audit and export: compare the organizer CSV with a direct database sum per team (R1 and R2); verify zero invariant violations, tie flags and the audit trail.
6. Rollback drill: redeploy the previous commit by SHA, verify health, scores intact; restore the database from backup into a second empty database (`npm run db:backup` / restore) and diff row counts.

## Capacity facts and risks (from `render.yaml`, `docs/phase-8-render-neon-deployment.md` and measurements)
- Current blueprint: Render **free** (512 MB RAM, 0.1 CPU, spins down after 15 min idle, ~1 min wake) + Neon **free** (scale-to-zero after 5 min, 100 CU-hours/month). Measured locally for 150 participants at 4x compressed think time: **server RSS peak 451 MB (88% of 512 MB: OOM risk)**, **60 CPU-seconds over 72 s (~0.84 core: about 8x the free tier's 0.1 CPU)**, 94 req/s, 23 DB connections peak with `DB_POOL_SIZE=5`.
- Conclusion: **the free tiers are not suitable for 150 simultaneous participants.** Realistic polling (speed 1) is roughly a quarter of the measured request rate (about 25-30 req/s) but the storm of submissions and logins at round start is the peak to size for.
- Suggested rehearsal sizing (verify current vendor pricing before authorizing): Render service with at least 1 vCPU and 2 GB RAM (a "Standard"-class instance), always-on (no sleep); PostgreSQL with always-on compute (no scale-to-zero) and at least 1 GB storage; keep one web instance (the in-process state is only the DB pool, but the 5-connection pool and login throttling are per process).
- Measure and report: p50/p95/p99 per endpoint, error rate by status, DB connections (peak/avg), `txStats` retries (expect 0), server RSS and CPU, cold-start time, restart recovery time, request payload per participant, and cost per hour of the chosen sizes.
- Other risks: cold start at the moment the round opens (mitigate: warm-up request 10 minutes before, always-on instance); Neon connection limits behind the pooler (keep `connection_limit` low); Render build memory on small plans; HTTPS origin must match `APP_ORIGIN` exactly or every mutation returns 403.

## Exit criteria
All tests above pass with zero invariant violations, zero 5xx, zero retries exhausted; restart and rollback verified; costs agreed. Only then plan the real deployment (Phase 6B/7).
