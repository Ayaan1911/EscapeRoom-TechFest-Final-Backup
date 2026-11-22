# Stops the lab server started by start-lab.ps1 (only the PID it recorded, only if it is still a node process). Safe to run twice.
. "$PSScriptRoot\lab-lib.ps1"
if (-not (Test-Path $PidFile)) { Write-Host "No lab server recorded (nothing to stop)."; exit 0 }
$id = [int](Get-Content $PidFile)
$proc = Get-Process -Id $id -ErrorAction SilentlyContinue
if ($proc -and $proc.ProcessName -eq "node") { Stop-Process -Id $id -Force; Write-Host "Stopped lab server (PID $id). Database contents are untouched." }
else { Write-Host "Recorded PID $id is not a running node process; clearing the stale record." }
Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
