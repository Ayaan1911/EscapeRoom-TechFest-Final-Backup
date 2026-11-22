# Health and diagnostics. Read-only.
#   On the SERVER PC:   scripts\lab\check-lab.ps1
#   On any CLIENT PC:   scripts\lab\check-lab.ps1 -Url http://<server-ip>:3000      (needs only PowerShell, no Node)
param([string]$Url, [int]$Samples = 20)
$ErrorActionPreference = "Continue"
function Row($state, $msg) { $c = @{ PASS = "Green"; FAIL = "Red"; WARN = "Yellow"; INFO = "Gray" }[$state]; Write-Host ("  [{0}] {1}" -f $state, $msg) -ForegroundColor $c }
$bad = 0

function Test-Http($base) {
  $times = @(); $errors = 0
  for ($i = 0; $i -lt $Samples; $i++) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try { $r = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ne 200) { $errors++ } } catch { $errors++ }
    $times += $sw.Elapsed.TotalMilliseconds
  }
  $s = $times | Sort-Object
  Row $(if ($errors) { "FAIL" } else { "PASS" }) ("/api/health x{0}: errors {1}, median {2:N0} ms, p95 {3:N0} ms, max {4:N0} ms" -f $Samples, $errors, $s[[int]($s.Count / 2)], $s[[math]::Min($s.Count - 1, [int]($s.Count * 0.95))], $s[-1])
  if ($errors) { $script:bad++ }
  try {
    $d = Invoke-RestMethod -Uri "$base/api/health?db=1" -TimeoutSec 8
    Row $(if ($d.database -eq "up") { "PASS" } else { "FAIL" }) "database: $($d.database), round 1: $($d.round)"
    if ($d.database -ne "up") { $script:bad++ }
  } catch { Row "FAIL" "/api/health?db=1 failed: $($_.Exception.Message)"; $script:bad++ }
  try { $l = Invoke-WebRequest -Uri "$base/login" -UseBasicParsing -TimeoutSec 8; Row "PASS" "/login serves HTTP $($l.StatusCode)" } catch { Row "FAIL" "/login failed: $($_.Exception.Message)"; $script:bad++ }
}

if ($Url) {
  Write-Host "== Client check of $Url" -ForegroundColor Cyan
  $u = [Uri]$Url
  $t = Test-NetConnection -ComputerName $u.Host -Port $u.Port -WarningAction SilentlyContinue
  if ($t.TcpTestSucceeded) { Row "PASS" "TCP $($u.Host):$($u.Port) reachable" } else {
    $script:bad++
    Row "FAIL" "TCP $($u.Host):$($u.Port) NOT reachable. Ping: $(if ($t.PingSucceeded) { 'replies' } else { 'no reply (ICMP may be blocked)' })"
    if ($t.PingSucceeded) { Row "INFO" "Host answers ping but the port is closed/filtered: server not running, wrong port, or the server PC's firewall rule is missing." }
    else { Row "INFO" "No ping and no TCP: wrong IP, server off, or the college network isolates these PCs (VLAN/client isolation). Compare with a second client PC; if none can reach it, ask IT." }
  }
  if ($t.TcpTestSucceeded) { Test-Http $Url.TrimEnd("/") }
  Write-Host ("`nResult: {0}" -f $(if ($bad) { "FAIL ($bad problem(s))" } else { "PASS" })); exit $(if ($bad) { 1 } else { 0 })
}

. "$PSScriptRoot\lab-lib.ps1"
Import-LabEnv
Write-Host "== Server check" -ForegroundColor Cyan
$port = [int]$env:LAB_PORT; $o = Get-LabOrigin
Row "INFO" "LAN address candidates: $((($o.All | ForEach-Object { "$($_.IP) [$($_.Adapter)$(if ($_.Virtual) { ', virtual' })]" }) -join '; '))"
Row "INFO" "Participants should open: $($o.Origin)"
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { Row "FAIL" "Nothing is listening on port $port. Start it: scripts\lab\start-lab.ps1"; exit 1 }
Row $(if ($conn.LocalAddress -in "0.0.0.0", "::") { "PASS" } else { "FAIL" }) "listening on $($conn.LocalAddress):$port (0.0.0.0 = reachable from the LAN; 127.0.0.1 = this PC only)"
$sp = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
if ($sp) { Row "INFO" ("server process: PID {0} {1}, memory {2:N0} MB, CPU time {3:N1} s, threads {4}" -f $sp.Id, $sp.ProcessName, ($sp.WorkingSet64 / 1MB), $sp.CPU, $sp.Threads.Count) }
$fw = @(Get-NetFirewallRule -DisplayName "GHOST404 Lab*" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" -and $_.Direction -eq "Inbound" })
Row $(if ($fw.Count) { "PASS" } else { "WARN" }) $(if ($fw.Count) { "firewall rule present: $($fw.DisplayName -join ', ')" } else { "no 'GHOST404 Lab' inbound rule found (other PCs will be blocked unless IT allows the port another way)" })
Write-Host "-- via localhost"; Test-Http "http://127.0.0.1:$port"
Write-Host "-- via LAN address (what other PCs use)"; Test-Http $o.Origin
$cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
if ($null -ne $cpu) { Row "INFO" ("machine CPU now: {0:N0}%" -f $cpu) }
Write-Host ("`nResult: {0}" -f $(if ($bad) { "FAIL ($bad problem(s))" } else { "PASS" })); exit $(if ($bad) { 1 } else { 0 })
