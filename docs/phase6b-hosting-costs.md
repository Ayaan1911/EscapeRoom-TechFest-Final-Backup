# Hosting cost review for the 150-participant workload (no plan selected, nothing purchased)

Researched on 2026-11-21 from vendor pages (links below). **Vendor pricing changes and pages disagree in places; every figure is an estimate to re-verify on the live pricing page before authorizing anything.** No account was accessed and no credential was requested.

## Measured workload (local, production build, 50 teams x 3 participants, storm, 4x compressed think time)
~94-99 requests/s, server process tree RSS peak ~451 MB, ~0.84 CPU-core, PostgreSQL connections peak 29-35 with `DB_POOL_SIZE=5` (one Node process), DB size ~10 MB. Realistic (1x) polling is roughly a quarter of the request rate; the round-start login burst and the final submission storm are the peaks to size for.

## Render web service (always-on instances, billed prorated by the second)
| Plan | CPU / RAM | List price | Fit for 150 participants |
|---|---|---|---|
| Free | 0.1 CPU / 512 MB, sleeps after 15 min idle | $0 | **No** (CPU ~8x short, RSS near the RAM limit, cold starts) |
| Starter | 0.5 CPU / 512 MB | $7 / month | **No** (RSS 451 MB leaves no headroom: OOM risk; CPU marginal) |
| **Standard** | 1 CPU / 2 GB | $25 / month | **Yes, recommended starting point** (about 1.2x the measured CPU at 4x load, 4x the RAM headroom) |
| Pro | 2 CPU / 4 GB | listed at $85 / month in one Render article (unconfirmed elsewhere) | Optional headroom for the storm |
Uncertainties: a Render **workspace** tier fee may apply ("Professional $25/mo + compute" on the pricing page) versus a free Hobby workspace; confirm whether paid instances are allowed on the workspace you will use. Render's own docs note that some spec tables are inconsistent between pages.

## Neon PostgreSQL (separate project `ghost404-loadtest`)
| Plan | Compute | Price | Notes |
|---|---|---|---|
| Free | autoscale up to 2 CU, 100 CU-hours/project/month | $0 | scale-to-zero after 5 min is fixed on Free; compute suspends and drops connections when the allowance runs out: **unsuitable for a timed event** |
| **Launch** | autoscale up to 16 CU | $0.106 per CU-hour (docs); an older blog post says $0.14 | scale-to-zero can be disabled; usage-based, no monthly minimum per the docs |
| Scale | up to 16 CU (fixed up to 56 CU) | $0.222 per CU-hour | not needed |
Storage about $0.35 per GB-month on paid plans (the database is ~10 MB). Connection limits (Neon docs disagree between pages; check `SHOW max_connections;` on the actual compute): about 104-112 at 0.25 CU, 419-450 at 1 CU, 839-901 at 2 CU. The pooled endpoint is PgBouncer in **transaction mode**: up to 10,000 client connections, pool size ~90% of max_connections. With `DB_POOL_SIZE=5` and one web instance the application needs ~5-35 server connections, far below any plan.
Important compatibility facts: **session-level** advisory locks are not supported on the pooled connection; the application uses only **transaction-level** advisory locks (`pg_advisory_xact_lock`) and `SELECT ... FOR SHARE`, which should be valid in transaction pooling but are NOT verified yet: that is exactly Gate 1. Migrations and backups must use the direct (non-pooled) URL.

## Estimates (rounded; assumptions in brackets)
| Scenario | Render | Neon | Total |
|---|---|---|---|
| Rehearsal, 2 days (Standard 48 h, Neon 1 CU always-on 48 h, a few GB-days) | about $1.7 | about $5.1 | **about $7 to $10** |
| Event day, 6 h incl. warm-up (Standard; Neon avg 1 CU, max 2 CU) | about $0.2 | about $0.6 to $1.3 | **about $1 to $3** |
| Event + rehearsal, Pro-class instance instead (2 CPU / 4 GB) | about $5.7 for 2 days | same | about $11 to $13 |
Billing minimums / extras to confirm: possible Render workspace fee ($0 to $25 per month if a Professional workspace is required), possible Neon plan floor on the account, bandwidth/overage lines (the measured payload is ~40 MiB per 150-participant run, negligible), and deleting resources immediately after the rehearsal so per-second billing stops.

## Recommendation (for approval, not applied)
Render **Standard** + Neon **Launch** with scale-to-zero disabled and 0.5 to 2 CU autoscaling, in the same region family (Singapore / `ap-southeast-1`); re-run the measurement on that stack and move to Pro-class only if the storm shows RSS above 70% of RAM or CPU saturation.

Sources: [Render Compute Plans](https://render.com/docs/compute-plans), [Render Postgres legacy instance types](https://render.com/docs/postgresql-legacy-instance-types), [Render pricing](https://render.com/pricing), [Render vs Railway comparison (plan table)](https://render.com/articles/render-vs-railway), [Neon plans](https://neon.com/docs/introduction/plans), [Neon usage-based pricing post](https://neon.com/blog/new-usage-based-pricing), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Neon serverless pooling guide](https://neon.com/docs/guides/serverless-connection-pooling).
