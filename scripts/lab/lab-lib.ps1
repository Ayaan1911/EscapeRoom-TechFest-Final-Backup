# Shared helpers for the GHOST_404 lab scripts (dot-sourced; not run directly).
$ErrorActionPreference = "Stop"
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:EnvFile = Join-Path $Root ".env.lab"
$script:StateDir = Join-Path $Root ".lab"
$script:PidFile = Join-Path $StateDir "server.pid"

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "  [ OK ] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }

# Node must run the TypeScript helpers (provisioning) natively: 22.18+ or 24+.
function Assert-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Fail "Node.js not found on PATH. See docs/lab-lan-runbook.md (Method A install, or Method B portable Node)." }
  $v = [version]((& node -v) -replace '^v', '')
  if (-not (($v.Major -eq 22 -and $v.Minor -ge 18) -or $v.Major -ge 24)) { Fail "Node $v is too old. Need Node 22.18+ (22 LTS) or 24+." }
  Ok "Node $v"
}

# Loads .env.lab into this process only. Process variables win over any stray .env / .env.production that Next or Prisma would also read.
function Import-LabEnv {
  if (-not (Test-Path $EnvFile)) { Fail ".env.lab not found. Copy .env.lab.example to .env.lab and fill it (docs/lab-lan-runbook.md)." }
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$' -and $line -notmatch '^\s*#') {
      $val = $Matches[2].Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($Matches[1], $val, "Process")
    }
  }
  foreach ($k in "DATABASE_URL", "DIRECT_URL", "ADMIN_ACCESS_HASH") { if (-not [Environment]::GetEnvironmentVariable($k)) { Fail "$k is missing in .env.lab" } }
  if (-not $env:LAB_PORT) { $env:LAB_PORT = "3000" }
  if ($env:LAB_PORT -notmatch '^\d{2,5}$') { Fail "LAB_PORT must be a number" }
}

# The ONLY databases the lab scripts will touch: name starts with ghost404_lab, on a local server (or a remote one only if explicitly allowed).
function Assert-LabDatabase {
  foreach ($k in "DATABASE_URL", "DIRECT_URL") {
    $u = [Environment]::GetEnvironmentVariable($k)
    if ($u -notmatch '^postgres(ql)?://[^/]+/([^?]+)') { Fail "$k is not a postgresql:// URL" }
    $dbName = $Matches[2]
    $uri = [Uri]($u -replace '^postgres(ql)?://', 'http://')
    if ($dbName -notmatch '^ghost404_lab[a-z0-9_]*$') { Fail "$k points at database '$dbName'. Lab scripts only use a database named ghost404_lab* (never ghost404_demo, neondb or any competition database)." }
    $isLocal = @("127.0.0.1", "localhost", "[::1]", "::1") -contains $uri.Host
    if (-not $isLocal -and $env:GHOST_LAB_ALLOW_REMOTE_DB -ne "1") { Fail "$k host '$($uri.Host)' is not local. For a dedicated remote lab database (its own Neon project) add GHOST_LAB_ALLOW_REMOTE_DB=1 to .env.lab." }
    Ok "$k -> database '$dbName' on $($uri.Host) (lab-only name check passed)"
  }
}

# LAN IPv4 candidates, best first: the adapter holding the default route, then physical/wired adapters. Link-local and loopback are excluded; virtual adapters sort last.
function Get-LanIps {
  $cfgs = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" }
  $rows = foreach ($c in $cfgs) {
    $ip = $c.IPv4Address[0].IPAddress
    if ($ip -like '169.254.*' -or $ip -like '127.*') { continue }
    $virtual = $c.InterfaceDescription -match 'Virtual|VMware|Hyper-V|VirtualBox|WSL|Loopback|TAP|VPN|Tunnel|Npcap'
    [pscustomobject]@{ IP = $ip; Adapter = $c.InterfaceAlias; Gateway = [bool]$c.IPv4DefaultGateway; Virtual = [bool]$virtual; Wired = (-not $virtual) -and ($c.InterfaceAlias -match 'Ethernet') }
  }
  @($rows | Sort-Object @{ e = { -[int]($_.Gateway -and -not $_.Virtual) } }, @{ e = { -[int]$_.Wired } }, @{ e = { [int]$_.Virtual } })
}
function Get-LabOrigin {
  $ips = @(Get-LanIps)
  if ($env:LAB_HOST_IP) { $ip = $env:LAB_HOST_IP } elseif ($ips.Count) { $ip = $ips[0].IP } else { Fail "No LAN IPv4 address found. Is the Ethernet cable connected? (or set LAB_HOST_IP in .env.lab)" }
  return @{ Ip = $ip; Origin = "http://${ip}:$($env:LAB_PORT)"; All = $ips }
}
function Get-ListenerPid($port) { $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess } }
