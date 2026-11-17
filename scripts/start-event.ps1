# Self-hosted production start (Windows PowerShell). Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts\start-event.ps1
# Safe order: preflight -> backup -> apply migrations -> start. Never resets or reseeds the database.
# Hosted deployments (Render) do not use this script; they run `npm run start:render` (see docs/phase-8-render-neon-deployment.md).
$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) { throw ".env missing. Copy .env.example to .env and fill DATABASE_URL / DIRECT_URL / ADMIN_ACCESS_HASH / APP_ORIGIN (https://...)." }
$envText = Get-Content .env -Raw
if ($envText -notmatch 'ADMIN_ACCESS_HASH="?[a-f0-9]{32}:') { throw "ADMIN_ACCESS_HASH not set. Run: `$env:GHOST_BOOTSTRAP_SECRET='<12+ char organizer code>'; node scripts/bootstrap.mjs" }
if ($envText -notmatch 'DATABASE_URL="?postgres(ql)?://') { throw "DATABASE_URL must be a postgresql:// URL (the SQLite file database is no longer supported)." }
if ($envText -notmatch 'DIRECT_URL="?postgres(ql)?://') { throw "DIRECT_URL (direct, non-pooled connection) is required for migrations and backups." }
if ($envText -notmatch 'APP_ORIGIN="https://') { Write-Warning "APP_ORIGIN is not https://. Secure session cookies will NOT work for participants on other devices." }
if (-not (Test-Path .next\BUILD_ID)) { Write-Host "No production build found; building..."; npm run build; if ($LASTEXITCODE) { throw "build failed" } }
$env:NODE_ENV = "production"
node --env-file=.env scripts/db-backup.mjs backup backups; if ($LASTEXITCODE) { throw "pre-start backup failed (is the database reachable?)" }
npx prisma migrate deploy; if ($LASTEXITCODE) { throw "migrate deploy failed" }
Write-Host "Starting on port 3000. Health: http://127.0.0.1:3000/api/health   Stop with Ctrl+C."
npx next start -p 3000 -H 0.0.0.0
