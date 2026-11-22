# One-time (and idempotent) preparation. Run from the project root:
#   powershell -ExecutionPolicy Bypass -File scripts\lab\prepare-lab.ps1 [-Teams 30] [-SetOrganizerCode] [-SkipInstall] [-SkipBuild]
# Does: checks -> npm ci -> prisma generate -> production build -> verifies the lab database identity -> applies migrations (additive only) -> optional synthetic teams.
# NEVER resets, truncates or reseeds a database. Teams are only ADDED, and only to a ghost404_lab* database.
param([int]$Teams = 0, [switch]$SetOrganizerCode, [switch]$SkipInstall, [switch]$SkipBuild)
. "$PSScriptRoot\lab-lib.ps1"
Set-Location $Root
Write-Host "== 1. Tools" -ForegroundColor Cyan
Assert-Node

if ($SetOrganizerCode) {
  if (-not (Test-Path $EnvFile)) { Fail ".env.lab not found. Copy .env.lab.example first." }
  $sec = Read-Host "New organizer access code (12+ characters, will not be shown)" -AsSecureString
  $env:GHOST_LAB_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $hash = (& node scripts/lab/lab-tool.mjs hash); if ($LASTEXITCODE) { Fail "Could not hash the code (12-256 characters required)" }
  $env:GHOST_LAB_SECRET = $null
  $text = Get-Content $EnvFile -Raw
  $line = "ADMIN_ACCESS_HASH=`"$hash`""
  if ($text -match '(?m)^ADMIN_ACCESS_HASH=.*$') { $text = $text -replace '(?m)^ADMIN_ACCESS_HASH=.*$', $line } else { $text = $text.TrimEnd() + "`r`n$line`r`n" }
  Set-Content $EnvFile $text -NoNewline
  Ok "Organizer code hash saved to .env.lab (the code itself is not stored)"
}

Write-Host "== 2. Configuration and database identity" -ForegroundColor Cyan
Import-LabEnv
Assert-LabDatabase

Write-Host "== 3. Dependencies and production build" -ForegroundColor Cyan
if (-not $SkipInstall -and -not (Test-Path node_modules)) { npm ci --include=dev; if ($LASTEXITCODE) { Fail "npm ci failed (needs internet for the npm registry, or use the portable package: Method B)" } } else { Ok "node_modules present" }
npx prisma generate | Out-Null; if ($LASTEXITCODE) { Fail "prisma generate failed" }; Ok "Prisma client generated"
if (-not $SkipBuild -or -not (Test-Path .next\BUILD_ID)) { npm run build; if ($LASTEXITCODE) { Fail "build failed" } } else { Ok "existing production build kept (-SkipBuild)" }

Write-Host "== 4. Database" -ForegroundColor Cyan
$info = & node scripts/lab/lab-tool.mjs db-check; if ($LASTEXITCODE) { Fail "Cannot reach the lab database. Is PostgreSQL running and are the credentials in .env.lab right?" }
Ok "Reachable: $info"
Write-Host "  Applying pending migrations (additive; target verified above)..."
npx prisma migrate deploy; if ($LASTEXITCODE) { Fail "migrate deploy failed" }
$info = & node scripts/lab/lab-tool.mjs db-check; Ok "After migrate: $info"

if ($Teams -gt 0) {
  Write-Host "== 5. Synthetic teams" -ForegroundColor Cyan
  $dbName = ($info | ConvertFrom-Json).database
  New-Item -ItemType Directory -Force (Join-Path $Root "private") | Out-Null
  $out = "private\lab-credentials-$(Get-Date -Format 'yyyyMMdd-HHmmss').csv"
  node scripts/provision-teams.mjs --generate $Teams --prefix LAB --out $out --apply --expect-database $dbName
  if ($LASTEXITCODE) { Fail "team provisioning failed" }
  Ok "Credentials file: $out (private, git-ignored; delete after the rehearsal)"
}
Write-Host "`nPrepared. Next: scripts\lab\start-lab.ps1" -ForegroundColor Green
