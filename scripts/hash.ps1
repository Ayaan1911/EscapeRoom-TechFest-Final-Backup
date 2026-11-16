$secret = Read-Host 'Organizer access code (at least 12 characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:GHOST_BOOTSTRAP_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node scripts/bootstrap.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:GHOST_BOOTSTRAP_SECRET -ErrorAction SilentlyContinue
}
