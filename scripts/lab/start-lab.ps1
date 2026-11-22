# Starts the production server for the lab LAN (foreground; Ctrl+C stops it cleanly).
#   powershell -ExecutionPolicy Bypass -File scripts\lab\start-lab.ps1
param([switch]$SkipDbCheck)
. "$PSScriptRoot\lab-lib.ps1"
Set-Location $Root
Write-Host "== Pre-flight" -ForegroundColor Cyan
Assert-Node
Import-LabEnv
Assert-LabDatabase
if (-not (Test-Path .next\BUILD_ID)) { Fail "No production build. Run scripts\lab\prepare-lab.ps1 first." }
$port = [int]$env:LAB_PORT
if (Test-Path $PidFile) {
  $old = [int](Get-Content $PidFile -ErrorAction SilentlyContinue)
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { Fail "A lab server is already running (PID $old). Stop it with scripts\lab\stop-lab.ps1." }
  Remove-Item $PidFile -Force
}
$busy = Get-ListenerPid $port
if ($busy) { Fail "Port $port is already used by PID $busy ($((Get-Process -Id $busy -ErrorAction SilentlyContinue).ProcessName)). Free it, or set LAB_PORT in .env.lab." }
Ok "Port $port is free"
if (-not $SkipDbCheck) { $info = & node scripts/lab/lab-tool.mjs db-check; if ($LASTEXITCODE) { Fail "Lab database unreachable. Start PostgreSQL / check .env.lab." }; Ok "Database: $info" }

$o = Get-LabOrigin
# No pinned APP_ORIGIN: the CSRF check then compares the browser Origin with the request Host (any consistent address works: LAN IP, localhost, hostname).
# GHOST_LAN_HTTP=1 relaxes the Secure cookie flag ONLY for this plain-http closed-LAN mode (browsers drop Secure cookies on http://<ip>).
$env:APP_ORIGIN = ""; $env:GHOST_LAN_HTTP = "1"; $env:NODE_ENV = "production"; $env:NEXT_TELEMETRY_DISABLED = "1"
if (-not $env:DB_POOL_SIZE) { $env:DB_POOL_SIZE = "10" }
Write-Host ""
Write-Host "  Participants open   :  $($o.Origin)" -ForegroundColor Green
Write-Host "  Organizer login     :  $($o.Origin)/organizer/login   (on the server PC, http://localhost:$port also works)"
Write-Host "  Projector           :  $($o.Origin)/admin/projector"
if ($o.All.Count -gt 1) { Write-Host "  Other adapters seen :  $((($o.All | Select-Object -Skip 1) | ForEach-Object { "$($_.IP) ($($_.Adapter))" }) -join ', ')  - set LAB_HOST_IP in .env.lab if the first address is wrong." -ForegroundColor Yellow }
Write-Host "  Others can connect only if TCP $port is allowed inbound (scripts\lab\firewall-lab.ps1). Stop: Ctrl+C or scripts\lab\stop-lab.ps1"
Write-Host ""

New-Item -ItemType Directory -Force $StateDir | Out-Null
$p = Start-Process -FilePath "node" -ArgumentList @("node_modules\next\dist\bin\next", "start", "-p", $port, "-H", "0.0.0.0") -NoNewWindow -PassThru
$p.Id | Set-Content $PidFile
try { $p.WaitForExit(); Write-Host "Server exited with code $($p.ExitCode)." -ForegroundColor Yellow }
finally {
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; Write-Host "Server stopped." }
  if ((Get-Content $PidFile -ErrorAction SilentlyContinue) -eq "$($p.Id)") { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue } # only our own record
}
