# Event-day production start (Windows PowerShell). Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts\start-event.ps1
# Safe order: preflight -> backup -> apply migrations -> start. Never resets or reseeds the database.
$ErrorActionPreference = "Stop"
if (-not (Test-Path .env)) { throw ".env missing. Copy .env.example to .env and fill ADMIN_ACCESS_HASH / APP_ORIGIN (https://...)." }
$envText = Get-Content .env -Raw
if ($envText -notmatch 'ADMIN_ACCESS_HASH="?[a-f0-9]{32}:') { throw "ADMIN_ACCESS_HASH not set. Run: `$env:GHOST_BOOTSTRAP_SECRET='<12+ char organizer code>'; node scripts/bootstrap.mjs" }
if ($envText -notmatch 'APP_ORIGIN="https://') { Write-Warning "APP_ORIGIN is not https://. Secure session cookies will NOT work for participants on other devices." }
$free = (Get-PSDrive -Name (Get-Location).Drive.Name).Free / 1GB
if ($free -lt 1) { throw "Less than 1 GB free disk; free space before the event." }
if (-not (Test-Path .next\BUILD_ID)) { Write-Host "No production build found; building..."; npm run build; if ($LASTEXITCODE) { throw "build failed" } }
$env:NODE_ENV = "production"
$dbLine = ($envText -split "`n" | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
$dbPath = ($dbLine -replace '^DATABASE_URL="?file:', '' -replace '[\?"].*$', '').Trim()
if ($dbPath -notmatch '^[A-Za-z]:' ) { $dbPath = Join-Path "prisma" $dbPath }
if (Test-Path $dbPath) { node scripts/db-backup.mjs backup $dbPath backups; if ($LASTEXITCODE) { throw "pre-start backup failed" } }
npx prisma migrate deploy; if ($LASTEXITCODE) { throw "migrate deploy failed" }
Write-Host "Starting on port 3000. Health: http://127.0.0.1:3000/api/health   Stop with Ctrl+C."
npx next start -p 3000 -H 0.0.0.0
