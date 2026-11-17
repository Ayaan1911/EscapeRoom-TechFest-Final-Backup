# Phase 8 — Render Free + Neon Free preview deployment

**Status: prepared, NOT deployed.** No Render or Neon account/session is connected to this machine (no CLI, no API key, no connector), so no external resource has been created and there is no live URL. Budget: ₹0. Nothing below enables a paid service.

## Architecture

* **App:** the existing Next.js server (`next start`) as one Render **Free** web service, HTTPS by Render.
* **Data:** Neon **Free** PostgreSQL. Nothing is stored on the Render filesystem (no SQLite file, no uploads).
* Two connection strings: `DATABASE_URL` = Neon *pooled* host (`-pooler`), used by the running app; `DIRECT_URL` = Neon *direct* host, used only by `prisma migrate` and the backup/provisioning scripts.
* Preview and real-event data are separated by **separate Neon projects** (preview = fictional teams only). Never point the preview service at the event database.

## What the free tiers mean (limits are from the vendors' own pages; re-check before the event)

| Item | Render Free | Neon Free |
|---|---|---|
| Compute | 512 MB RAM, 0.1 CPU | autoscaling CU, scale-to-zero after 5 min idle (fixed on Free) |
| Idle behaviour | spins down after 15 min without inbound traffic; wake-up can take about a minute | first query after idle must wake compute (set `connect_timeout=30`) |
| Monthly quota | 750 instance hours/workspace | compute-hour and storage caps per project (Neon's 2026 FAQ says 100 CU-hours and 1 GB per project; older pages say 0.5 GB). Exceeding the compute cap suspends the database until next month |
| Other | may be restarted at any time | pooled connection via PgBouncer |

Consequences for an event: (1) the service **must be warmed and kept awake** for the whole round (an external pinger on `/api/health` every ~10 min; this endpoint deliberately does not touch the database, so it does not burn Neon hours); (2) 0.1 CPU is the likely bottleneck for 150 participants (scrypt logins, server rendering). That is measured in the remote load test, not assumed. If it fails, the mitigation is a paid Render instance (owner decision, not enabled here).

## One-time setup (owner actions; ~20 minutes)

1. **Neon:** create an account, a Free project in AWS Singapore (`ap-southeast-1`), database `ghost404_preview`. From *Connect* copy the **pooled** and **direct** connection strings. Do not paste them into chat.
2. **Local private file `.env.preview`** (git-ignored) — copy `.env.example` and fill `DATABASE_URL`, `DIRECT_URL`; add `ADMIN_ACCESS_HASH` from step 3; `APP_ORIGIN` after step 5.
3. **Organizer hash:** `$env:GHOST_BOOTSTRAP_SECRET='<12+ char code you choose>'; node scripts/bootstrap.mjs` writes only the *hash* into `.env`; copy that one line into `.env.preview`. Keep the plain code in your password manager.
4. **Schema:** `npm run preview:migrate` (applies the PostgreSQL baseline to the empty Neon database; it never drops anything).
5. **Render:** New → Blueprint → connect `Ayaan1911/EscapeRoom-TechFest`. Render reads `render.yaml` (free plan, manual deploys, `/api/health`). Enter the four secrets (`DATABASE_URL`, `DIRECT_URL`, `ADMIN_ACCESS_HASH`, `APP_ORIGIN`). `APP_ORIGIN` is the exact `https://<service>.onrender.com` shown by Render (no trailing slash); if it is not known until the service exists, set it, then redeploy once.
6. **Deploy the reviewed commit only:** *Manual Deploy → Deploy a specific commit* and record the SHA (the report names the one to use). Confirm Auto-Deploy is **Off** and that no Round 2 branch is connected.
7. **Verify:** `https://<origin>/api/health` → `{"ok":true}`; `…/api/health?db=1` → `{"ok":true,"database":"up",…}`; open `/login`, sign in as organizer.

The start command `npm run start:render` runs `prisma migrate deploy` *before* `next start`, so the schema is applied before traffic (it is idempotent and also runs on every cold start).

## Remote load and recovery test (separate disposable environment only)

**Never run the load test against the preview or event service/database.** The harness is fail-closed and refuses anything that is not a dedicated test environment (rules enforced and unit-tested in `scripts/load-safety.mjs`, `tests/load-safety.test.ts`).

### Test environment (preferred design)

* A **separate Neon project** (Free allows many; each has its own compute and storage quota) with a database named with `loadtest`, e.g. `ghost404_loadtest`. Nothing connects it to the preview database.
* A **separate Render Free service** whose hostname contains `loadtest`, e.g. `ghost404-loadtest.onrender.com`, with its own `DATABASE_URL`/`DIRECT_URL` (the loadtest database), its own `ADMIN_ACCESS_HASH`, `APP_ORIGIN`. Apply the schema with `prisma migrate deploy` (the start command does it). Create **no** teams.
* Quotas (vendor pages, checked 2026-11-18, re-check): Neon Free 100 CU-hours and 1 GB per project (older pages say 0.5 GB), no overage billing, computes suspend at the cap; Render Free 750 instance hours per workspace per month shared by all free services (a second always-on free service roughly doubles hour use: 2 x 744 h > 750 h, so keep the test service **suspended** except during a run and keep the preview service for demos only), 512 MB / 0.1 CPU, spin-down after 15 idle minutes. Everything stays on free plans; nothing here enables a paid service.
* Delete or suspend the test service and database after the run (owner action in the dashboards; the harness never drops a hosted database).

### What the harness guarantees

1. Remote mode needs **all** of: `--origin https://<host containing "loadtest">`, `--yes-remote`, `--authorize-round-control` (it starts, then expires, the round on the TEST service), `GHOST_LOAD_ENV=disposable-loadtest`, `GHOST_LOAD_TARGET_DB=<exact database name>`, `GHOST_LOAD_DATABASE_URL`, `GHOST_LOAD_ADMIN_CODE`. The database name must contain `loadtest` and must not contain preview/prod/event/live/round1/real.
2. The database must be **completely empty** (no teams, sessions, submissions, audit rows, login attempts, and no started round) or the run aborts before writing.
3. **Identity proof:** it seeds a nonce-named marker team in the target database and logs in to the hosted origin as that team; if the service does not see that team, it stops. (A wrong origin therefore costs at most one failed-login throttle row with a random key there; it never starts a round or seeds game data on an unverified service.)
4. **Scoped cleanup only:** it deletes exact tracked ids/keys/tokens (its teams `GH-nn`/`GHZ-ID-*`, their submissions and audit rows by actor, their login-attempt keys, its own organizer session by token hash) and compare-and-restores the round row only if it still holds exactly what the run wrote. There is no unfiltered or time-window delete anywhere; failure, Ctrl-C and the `--max-minutes` timeout (default 40) all run the same scoped cleanup and nothing else. Errors and logs are redacted (connection strings, passwords, the organizer code).

### Run (owner shell; values are never printed or committed)

```powershell
$env:GHOST_LOAD_ENV = "disposable-loadtest"
$env:GHOST_LOAD_TARGET_DB = "ghost404_loadtest"
$env:GHOST_LOAD_DATABASE_URL = "<direct url of the loadtest database>"
$env:GHOST_LOAD_ADMIN_CODE = "<organizer code of the TEST service>"
node scripts/load-test.mjs --origin https://ghost404-loadtest.onrender.com --teams 50 --storm --yes-remote --authorize-round-control --pause-for-restart
```

It reports error rate, login/submission/poll latency, PostgreSQL connections, payload volume, completion and recovery. At the prompt, restart the test service from the Render dashboard to prove persistence. CPU/memory come from Render *Metrics*; compute hours and transfer from Neon *Usage*. Local mode (default, no flags) uses a disposable local PostgreSQL database and is unchanged.

## Fictional demo teams (after the load test)

```powershell
npm run preview:teams -- --generate 3 --out private\preview-credentials.csv            # dry run
npm run preview:teams -- --generate 3 --out private\preview-credentials.csv --apply --expect-database ghost404_preview
```

The credentials file stays local and git-ignored. Share a team's code only with the person demoing.

## Backup, restore, rollback

* `npm run preview:backup` writes a JSON snapshot (`backups/preview/…`) from `DIRECT_URL`. `node scripts/db-backup.mjs verify <file>`. `restore <file> --yes` only fills an **empty** database; replacing a populated one needs `--replace` and `GHOST_CONFIRM_DB=<database name>`. Neon's own point-in-time restore is an additional, provider-side safety net (window depends on plan).
* Code rollback: *Deploy a specific commit* with the previous recorded SHA. Migrations are additive; never roll the schema back on a database that holds data.

## Security notes for the hosted service

Secrets exist only in the Render dashboard and your local ignored files. Session cookies are `Secure` on HTTPS; admin and team cookies are separate. Responses carry nosniff, frame, referrer, permissions and HSTS headers. `/api/health` exposes no data. Preview access is limited by not publishing the URL and by per-team codes; there is no IP allow-list in the app.

## Not verified here (needs the real accounts)

Neon PgBouncer transaction-mode behaviour with Serializable transactions (local tests used a plain PostgreSQL 15 container); Render build memory on the free plan; cold-start times; whether the free CPU sustains 50 teams. If the pooled URL misbehaves, the fallback is to set `DATABASE_URL` to the direct URL with `DB_POOL_SIZE=5` (Neon Free allows enough direct connections for one small service). Event readiness is **not** claimed.
