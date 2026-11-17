# Keeps a rolling online backup during the event (default every 5 minutes, keeps the newest 24).
# powershell -ExecutionPolicy Bypass -File scripts\backup-loop.ps1 -Db prisma\dev.db -Dir backups -Minutes 5
param([string]$Db = "prisma\dev.db", [string]$Dir = "backups", [int]$Minutes = 5, [int]$Keep = 24)
while ($true) {
  node scripts/db-backup.mjs backup $Db $Dir
  Get-ChildItem $Dir -Filter "ghost-*.db" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
  Start-Sleep -Seconds ($Minutes * 60)
}
