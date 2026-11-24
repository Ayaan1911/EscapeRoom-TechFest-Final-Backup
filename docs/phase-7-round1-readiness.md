# Phase 7 — Round 1 readiness

> **Superseded in Phase 8:** persistence moved from SQLite to PostgreSQL (Neon). Sections below that describe SQLite files, WAL, `connection_limit=1`, `VACUUM INTO` backups and `prisma\dev.db` are historical. Current procedures: `docs/phase-8-render-neon-deployment.md`. The 50-team load test was re-run on PostgreSQL in Phase 8 (0 errors, 50/50 teams).

Branch `feat/phase-7-round1-readiness` (from Phase 6 commit `b7cd422`). Scope: provisioning, load/reliability, security, operations. No Round 2 work, no deployment.

## Status (three separate levels)

| Level | Status | Basis |
|---|---|---|
| GAMEPLAY COMPLETE | **Yes** | All five chapters playable; 50 scripted teams (A/B/C) completed Inbox→Final Verdict through the real API routes from zero progress; browser suites cover every chapter UI. |
| TECHNICALLY VERIFIED | **Yes, for the tested environment** (one Windows laptop, production build, local SQLite, loopback network) | Lint, typecheck, unit/DB/browser tests, 50-team load test, restart recovery, backup/restore, bundle scan, `npm audit` = 0. |
| EVENT READY | **No — not claimable from local tests** | Needs hosting + HTTPS, real devices/network, printed kits, volunteers, accessibility and student timing (see “Remaining human tasks”). |

## Chapters (unchanged rules)

Inbox 15, Trail 25, Insider 25, Containment 20, Final Verdict 15, Tamper Alert +5 once → max 105. Hints −3 (first) / −9 total for two. Ranking: total, Ch2+Ch3 raw, fewest hints, fastest completion, team ID. One shared 60-minute timer; no Round 2 advancement.

## What changed in Phase 7

| Area | Change |
|---|---|
| Team provisioning | `scripts/provision-teams.mjs` (`npm run teams:provision`): CSV or generated teams, 20-char random codes (~99 bits), scrypt-hashed, A/B/C balanced against existing teams, dry-run by default, refuses existing IDs, never overwrites a credentials file, `--list` shows teams without codes. |
| **Login-burst defect (found by load test)** | 150 simultaneous logins produced 500s (Prisma P1008/P2028) because `scryptSync` blocked the event loop and SQLite transactions timed out. Fixed: async scrypt (`verifyPasswordAsync`), WAL journal mode, single SQLite connection by default, 15 s transaction queueing (`src/lib/db.ts`, `src/lib/auth.ts`). |
| Health | `GET /api/health` (no auth, no data). |
| Backup/restore | `scripts/db-backup.mjs` (online `VACUUM INTO`, integrity check, restore keeps previous file), `scripts/backup-loop.ps1`. |
| Event start | `scripts/start-event.ps1`: preflight → backup → `migrate deploy` → `next start`. |
| Headers | `next.config.ts`: nosniff, frame SAMEORIGIN, referrer, permissions, HSTS, no `X-Powered-By`. |
| Dependencies | `overrides.deepmerge-ts = 8.0.2` clears the 3 high `npm audit` findings (see Security). |
| Rehearsal | `npm run rehearsal:round1` (real app, temp DB, zero-progress teams, step guide). |
| Load harness | `npm run load:round1` → `scripts/load-test.mjs`. |
| Tests | `tests/provisioning.test.ts`, `tests/physical-and-bundle.test.ts`. |

## Provisioning procedure (organizer machine only)

```powershell
# 1. Prepare teams.csv  (header: id,name,participant1,participant2,participant3 ; id may be blank)
# 2. Dry run (writes nothing)
npm run teams:provision -- --input teams.csv --out private\credentials.csv
# 3. Register for real (creates private\credentials.csv; keep it where only you can read it; refuses to overwrite)
npm run teams:provision -- --input teams.csv --out private\credentials.csv --apply
# 4. Inspect registration (no codes are shown or recoverable)
npm run teams:provision -- --list
```

`private/` and `backups/` are git-ignored. Distribute each team's code individually (printed slip/envelope), then delete the credentials file after the event. A lost code cannot be recovered; provision a replacement team ID or reset via a database operation approved by the owner. Fictional rehearsal teams: `--generate 50` into a **disposable** `DATABASE_URL` only.

## Load test (reproducible)

Real production build (`next start`), disposable DB, 50 teams × 3 participants (150 sessions), organizer polling dashboard + CSV, wrong answers, hints, tamper alerts, physical-unlock, simultaneous final submissions ("storm"), then restart + deadline expiry:

```powershell
npm run build
npm run load:round1 -- --teams 50 --storm      # ~2.5 min; add --speed 4 to compress polling
```

Pre-defined acceptance thresholds: 0 HTTP 5xx / network errors; 0 invariant violations; 50/50 teams complete with exact expected scores; poll p95 < 1 s; submission p95 < 2 s; login p95 < 5 s; server memory < 1 GB; state intact after restart; post-deadline submission rejected.

Measured (Windows 11 laptop, same machine for client and server, 2026-11-17, final run):

| Metric | Result |
|---|---|
| Requests | 5,210 in 147 s (≈35 req/s avg; real event polling is lighter than this compressed 2.5-minute game) |
| Errors / 5xx / auth failures | **0 / 0 / 0** (153 logins, all 303) |
| Teams completed / exact scores | 50/50; bonus awarded to exactly 10 intended teams; 0 invariant violations |
| Poll `/api/game` | p50 97 ms, p95 252 ms, max 1.2 s (n=3,674) |
| Correct submissions | p50 70 ms, p95 960 ms (during simultaneous final storm), max 1.3 s |
| Login submit | p50 375 ms, p95 686 ms |
| Organizer dashboard / CSV | p95 501 ms / 133 ms |
| Server memory / CPU | peak 311 MB; 28 CPU-seconds over 140 s |
| DB size | 308 KiB |
| Restart recovery | saved score and session survive restart; late submission → 409 “Round is not active”; scores unchanged |

Intermediate runs before the fix (kept for the record): 44 of 65 login requests failed with 500 under the same burst; with the single-connection setting but synchronous scrypt, 1–2 requests still returned 500. Both resolved in the final run.

**Limits of this evidence:** client and server shared one machine (no real Wi-Fi latency or TLS), loopback only, one 50-team run per configuration plus repeat runs, scripted rather than human timing. It shows SQLite + WAL + single connection is adequate for ~50 teams on one process; it does not prove a particular host or network. PostgreSQL was **not** needed on this evidence and was not implemented (an untested migration would add risk). Re-run `npm run load:round1` on the real host.

## Hosting / architecture

* One Node process (`next start`) + one local SQLite file (WAL) on a machine with a persistent local disk. Not serverless, not multiple instances (SQLite single writer; the in-memory dev store is not shared).
* **HTTPS is mandatory for participants:** session cookies are `Secure` in production, so login over plain `http://<LAN-IP>` will not persist (only `localhost` is exempt). Choose one: (a) small VPS/PaaS with a persistent volume and automatic HTTPS; (b) the organizer laptop publishing HTTPS via a tunnel/reverse proxy. No provider has been selected or provisioned by this work. Set `APP_ORIGIN` to the exact public `https://` origin (same-origin checks compare against it).
* QR codes in the Chapter 1 kit encode the configured origin, so they must be generated **after** the final URL is fixed and tested from a phone on the venue network.
* Docker was not used (disk constraints, and an untested container file would be misleading).

Operational scripts: `scripts/start-event.ps1`, `scripts/backup-loop.ps1`, `scripts/db-backup.mjs`, `/api/health`.

## Backup and restore

```powershell
node scripts/db-backup.mjs backup prisma\dev.db backups     # safe while running
node scripts/db-backup.mjs verify backups\ghost-<stamp>.db  # integrity + counts
# Restore: STOP the app first
node scripts/db-backup.mjs restore backups\ghost-<stamp>.db prisma\dev.db --yes
```

The pre-restore database is kept as `<db>.before-restore-<stamp>`; stale `-wal/-shm` files are removed so they cannot replay. Verified by an automated test (50-team DB → backup → verify → restore) and a manual run. Copy `backups\` to a second device during the event. Never publish `backups/`/`prisma/backups/` (contain team data and hashes).

## Organizer event-day procedure

1. `powershell -ExecutionPolicy Bypass -File scripts\start-event.ps1` (second window: `scripts\backup-loop.ps1`).
2. Check `/api/health`; log in at `/login?role=admin`.
3. Provision teams (above) *before* the event; confirm count in the admin “Registered teams” table.
4. (Superseded 2026-11-25: no QR and no CCTV kit are needed any more; the Insider fragments are now three shared pairs. See `ghost404-release-checklist.md`.) Print kits: `/admin/inbox-kit` (QR), `/admin/insider-kit` (Part A private cards per team, Part B public wall cards), `/admin/containment-kit` (CCTV by variant). Keep the A/B stacks separate until play.
5. **Start Round 1** on `/admin` (this fixes the single 60-minute deadline; it cannot be restarted).
6. Monitor team scores/hints; (the accessible-CCTV authorization is retired: the evidence is on screen) use the **progression override** on `/admin` only with a written reason (audited).
7. When time ends (or **Stop**), review the PROVISIONAL → final table, Top 10 + 2 standby, incomplete teams, then **Confirm results**. Export `/api/admin/scores` (CSV, formula-safe). No automatic Round 2 advancement.

Volunteer cheat-sheet: teams log in with Team ID + code only; never read codes aloud; a team that loses its A card is re-issued by reprinting that team's page from `/admin/insider-kit` (the fragment is unchanged; log it); a missing public B card is reprinted from its station page; if a participant's page shows “Round is not active” the clock has expired or not started.

Network outage: the game is online-only. If Wi‑Fi drops, progress is saved server-side per submission; participants reload and log in again. If the server dies, restart with the script; sessions and scores persist (verified). If the DB file is damaged, restore the latest verified backup (loses at most the backup interval). The timer is server-side absolute (`deadline`); do not extend it except by an owner decision made on the record.

Escalation: server down > 2 min → restart; still down → restore latest backup on the same host; hosting/network failure → owner decides on a paper fallback (not implemented here).

## Security review

* **npm audit:** was 3 high (`prisma@6.19.3 → @prisma/config → deepmerge-ts <8`, stack exhaustion on recursive objects; Prisma CLI config loading only, not a request path). Resolved with a scoped `overrides` pin to `deepmerge-ts@8.0.2`; `prisma validate`, `migrate deploy`, client generation, and all tests pass; `npm audit` now reports 0. This is a transitive override of a Prisma-internal package, not a Prisma upgrade; if Prisma later pins an incompatible API, remove the override. Remaining upgrade to Prisma 7+ is deliberately deferred.
* **Fixed this phase:** login-burst denial-of-service weakness (blocking scrypt), added security headers, health endpoint exposes no data.
* **Verified controls:** team/admin session separation; anonymous `/api/game` and `/api/admin/scores` → 401; same-origin check on POST; Zod strict bodies and 16 KiB cap; per-ID login throttle (10/15 min); 3 s submission cooldown; server-side scoring in `Serializable` transactions; deadline re-check at the persistence boundary; CSV formula escaping; audit log for overrides/hints/tamper/copies; no real network actions anywhere.
* **Bundle scan:** automated test fails if `.next/static` contains secrets, validators, hashes, fragment-shaped strings or whole answer objects.
* **Known limitations:** no strict script CSP (Next inline bootstrap needs nonces); login throttle is per-ID (a distributed guesser could still try many IDs; codes have ~99 bits so brute force is infeasible); one organizer credential shared by volunteers; in-memory nothing, but a single server process is a single point of failure; evidence text is untrusted content rendered as plain text by React (no `innerHTML`/`dangerouslySetInnerHTML` anywhere in `src` at the time of writing); organizer session lasts 12 h.

## Remaining human tasks (not performed here)

Select/provision hosting and HTTPS; set production `.env`; real phone QR scans from the venue network; real printing/A4 layout check and physical card cutting/distribution; seating/wall placement; volunteer briefing; accessibility review with real users; timed student pilot (60 min wall clock — this phase used compressed scripted timing, with the real deadline only simulated by moving it); real-device browser matrix; owner playtest using `docs/round1-owner-test-checklist.md`; on-site network/outage drill.
