# Scoped inbound rule for the lab port: TCP <port>, local subnet only. Adding/removing needs an elevated (Administrator) PowerShell; ask college IT if you cannot elevate.
#   firewall-lab.ps1 -Show      print what -Add would do (no admin needed; changes nothing)
#   firewall-lab.ps1 -Add       create the rule   |   -Remove   delete it after the rehearsal
param([switch]$Add, [switch]$Remove, [int]$Port = 3000)
$name = "GHOST404 Lab ($Port)"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("Administrator")
$existing = @(Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue).Count
if ($Remove) {
  if (-not $admin) { Write-Host "Needs an elevated PowerShell." -ForegroundColor Red; exit 1 }
  Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue; Write-Host "Removed rule '$name'."; exit 0
}
if ($Add) {
  if (-not $admin) { Write-Host "Needs an elevated PowerShell (Run as administrator)." -ForegroundColor Red; exit 1 }
  if ($existing) { Write-Host "Rule '$name' already exists."; exit 0 }
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
  Write-Host "Created rule '$name' (inbound TCP $Port, local subnet only). Remove it afterwards: firewall-lab.ps1 -Remove -Port $Port"; exit 0
}
Write-Host "-Add would run: New-NetFirewallRule -DisplayName '$name' -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow -Profile Any"
Write-Host "Windows Firewall stays ON; only this port and only the local subnet. Existing '$name' rules: $existing. Running as administrator: $admin"
