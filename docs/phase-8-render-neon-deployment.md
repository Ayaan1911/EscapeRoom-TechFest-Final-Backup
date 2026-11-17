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

## Remote load and recovery test (after deploy, before any demo)

Use a **fresh, empty** preview database (the harness refuses a database that already has teams, seeds 50 fictional `GH-nn` teams directly, plays the game over HTTPS, then deletes everything it created).

```powershell
$env:GHOST_LOAD_DATABASE_URL = "<direct url>"   # preview DB only
$env:GHOST_LOAD_ADMIN_CODE   = "<organizer code>"
node scripts/load-test.mjs --origin https://<service>.onrender.com --teams 50 --storm --yes-remote --pause-for-restart
```

It reports error rate, login/submission/poll latency, PostgreSQL connections, payload volume and recovery. At the prompt, restart the service from the Render dashboard to prove state survives a restart. Read CPU/memory from the Render *Metrics* tab and data transfer/compute hours from the Neon *Usage* page; the client cannot measure those. Run **before** provisioning demo teams.

## Fictional demo teams (after the load test)

```powershell
npm run preview:teams -- --generate 3 --out private\preview-credentials.csv            # dry run
npm run preview:teams -- --generate 3 --out private\preview-credentials.csv --apply
```

The credentials file stays local and git-ignored. Share a team's code only with the person demoing.

## Backup, restore, rollback

* `npm run preview:backup` writes a JSON snapshot (`backups/preview/…`) from `DIRECT_URL`. `node scripts/db-backup.mjs verify <file>`. `restore <file> --yes` only fills an **empty** database; replacing a populated one needs `--replace` and `GHOST_CONFIRM_DB=<database name>`. Neon's own point-in-time restore is an additional, provider-side safety net (window depends on plan).
* Code rollback: *Deploy a specific commit* with the previous recorded SHA. Migrations are additive; never roll the schema back on a database that holds data.

## Security notes for the hosted service

Secrets exist only in the Render dashboard and your local ignored files. Session cookies are `Secure` on HTTPS; admin and team cookies are separate. Responses carry nosniff, frame, referrer, permissions and HSTS headers. `/api/health` exposes no data. Preview access is limited by not publishing the URL and by per-team codes; there is no IP allow-list in the app.

## Not verified here (needs the real accounts)

Neon PgBouncer transaction-mode behaviour with Serializable transactions (local tests used a plain PostgreSQL 15 container); Render build memory on the free plan; cold-start times; whether the free CPU sustains 50 teams. If the pooled URL misbehaves, the fallback is to set `DATABASE_URL` to the direct URL with `DB_POOL_SIZE=5` (Neon Free allows enough direct connections for one small service). Event readiness is **not** claimed.
