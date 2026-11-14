param([switch]$KeepRunning)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'payment-test-env.ps1')

& (Join-Path $PSScriptRoot 'payment-test-up.ps1')
$exit = 1
try {
  pnpm.cmd run test:integration:payment
  $exit = $LASTEXITCODE
} finally {
  if (-not $KeepRunning) { & (Join-Path $PSScriptRoot 'payment-test-down.ps1') }
}
exit $exit
