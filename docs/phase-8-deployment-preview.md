# Phase 8 — HTTPS preview: preparation (NOT deployed)

**Deployment status: not deployed.** No hosting account, payment approval or provider authorization exists in this session. Nothing has been published; there is no live URL. This document is the procedure to follow once the owner approves a host.

## Hosting choice

The app needs **one Node process + one persistent local SQLite file (WAL)**. That rules out serverless and any ephemeral filesystem.

| Option | Fit | Status |
|---|---|---|
| Render **paid** web service + persistent disk | Disk attaches to one instance, automatic HTTPS, health check path, snapshots every 24 h. Per Render docs, disks exist only on paid services; free services use temporary storage, so SQLite there would be **lost on every restart/redeploy**. Disk-attached services cannot scale to several instances and lose zero-downtime deploys (both acceptable here). | Recommended; needs owner account + spend approval |
| Railway + volume | Plausible (single service + volume), but plan/price **was not verified** in this session. | Verify on Railway's pricing page before choosing |
| Organizer laptop + HTTPS tunnel | Zero cost, already load-tested locally, but depends on the laptop staying on and on a tunnel provider. | Fallback for a short demo |

Do **not** use a free Render instance with `DATABASE_URL` pointing at the app folder.

## Settings for the chosen host (Render shown)

* Build: `npm ci && npx prisma generate && npm run build`
* Start: `npx prisma migrate deploy && npm run start` (migrations are additive and were exercised in every test run)
* Health check path: `/api/health` (returns `{ok, database, round}`, no data)
* Disk mounted at `/var/data`; env:
  * `DATABASE_URL=file:/var/data/ghost.db`
  * `APP_ORIGIN=https://<exact public origin>` (same-origin checks compare to it; QR codes embed it)
  * `ADMIN_ACCESS_HASH` — generate locally with `GHOST_BOOTSTRAP_SECRET='<12+ char code>' node scripts/bootstrap.mjs`, paste only the hash. Never commit it; never paste the plain code into the host.
  * `NODE_ENV=production` (host default for `next start`)
* **Auto-deploy: off, or pinned to the single reviewed commit/branch.** Do not point it at any Round 2 branch. Record the deployed SHA.
* Exactly **one instance**.

## Preview data isolation

* Fresh disk and database for the preview; never copy a real-event database or `private/credentials.csv` onto it.
* Fictional teams only: `DATABASE_URL=file:/var/data/ghost.db npm run teams:provision -- --generate 3 --out private/preview-credentials.csv --apply` (run in the host shell; keep that file off Git — `private/` is ignored).
* Restrict access: share the URL only with the owner; hand out the generated codes privately. There is no IP allow-list in the app; if one is required, put the host's access control in front.

## Backup, rollback

* Backup: `node scripts/db-backup.mjs backup /var/data/ghost.db /var/data/backups` (safe while running); copy off the host. Render also snapshots the disk daily.
* Restore: stop the service, `node scripts/db-backup.mjs restore <file> /var/data/ghost.db --yes`, restart.
* Code rollback: redeploy the previous recorded commit SHA. Migrations are additive; do not roll the schema back on a database holding data.

## Before calling it ready (not done yet)

1. Owner chooses host, creates the account, approves any cost.
2. Deploy the exact reviewed commit; check `/api/health`; log in with team and organizer in **one browser profile** (HTTPS, `Secure` cookies).
3. Run `npm run load:round1` **against the deployed host** (the harness currently spawns its own server; pointing it at a remote origin is not implemented — run it on an identical single-instance host or adapt it first). Local results prove nothing about a particular host.
4. Phone QR scan from the real network; printed kits; timed pilot.

EVENT READY remains unclaimed.
