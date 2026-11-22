# Method B helper - run on the DEVELOPMENT laptop (Windows x64) after `npm run build`.
# Creates one zip with the source, the production build and node_modules (incl. the Windows Prisma engine and Next SWC binaries) so a restricted lab PC
# needs no git, no npm and no internet. It NEVER includes .env*, private\, backups\, .git or the build cache.
#   powershell -ExecutionPolicy Bypass -File scripts\lab\package-lab.ps1 [-Out D:\transfer]
# The lab PC must also be Windows x64 and have a Node 22.18+/24 runtime (portable zip from nodejs.org is fine) and a PostgreSQL for the lab database.
param([string]$Out = (Join-Path (Split-Path (Resolve-Path "$PSScriptRoot\..\..").Path -Parent) "lab-package"))
. "$PSScriptRoot\lab-lib.ps1"
Set-Location $Root
if (-not (Test-Path .next\BUILD_ID)) { Fail "No production build. Run: npm run build" }
if (-not (Test-Path node_modules\.prisma\client)) { Fail "Prisma client not generated. Run: npx prisma generate" }
$sha = (git rev-parse --short HEAD).Trim()
$dirty = git status --porcelain --untracked-files=no
if ($dirty) { Warn "Uncommitted changes exist; the zip is built from the working tree but is labelled $sha-dirty."; $sha = "$sha-dirty" }
New-Item -ItemType Directory -Force $Out | Out-Null
$zip = Join-Path $Out "ghost404-lab-$sha.zip"
if (Test-Path $zip) { Fail "$zip already exists (not overwriting). Delete it or pick another -Out." }
$list = Join-Path $env:TEMP "ghost404-pack-$sha.txt"
(git ls-files) + @(".next", "node_modules", ".env.lab.example") | Where-Object { $_ -and (Test-Path $_) } | Set-Content $list -Encoding ascii
tar -a -c -f $zip --exclude=".next/cache" --exclude="node_modules/.cache" -T $list
if ($LASTEXITCODE) { Fail "tar failed" }
Remove-Item $list -Force
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
Ok ("{0}  ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
Write-Host "SHA256 $hash  - verify it on the lab PC:  Get-FileHash <zip> -Algorithm SHA256"
Write-Host "Built from commit $sha with Node $(node -v) on Windows x64. Lab PC: same OS family/architecture."
