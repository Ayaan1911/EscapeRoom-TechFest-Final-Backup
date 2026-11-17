# Keeps a rolling logical backup during the event (default every 5 minutes, keeps the newest 24). Reads DIRECT_URL from .env.
# powershell -ExecutionPolicy Bypass -File scripts\backup-loop.ps1 -Dir backups -Minutes 5
param([string]$Dir = "backups", [int]$Minutes = 5, [int]$Keep = 24)
while ($true) {
  node --env-file=.env scripts/db-backup.mjs backup $Dir
  Get-ChildItem $Dir -Filter "ghost-*.json" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  Start-Sleep -Seconds ($Minutes * 60)
}
