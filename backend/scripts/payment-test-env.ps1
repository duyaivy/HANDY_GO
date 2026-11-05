$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Test-only credentials for the throwaway container (see docker-compose.payment-test.yml).
$testUrl = 'postgresql://handygo_test:handygo_test_pw@localhost:55433/handygo_hg51_payment_test'
$env:PAYMENT_TEST_DATABASE_URL = $testUrl
$env:DATABASE_URL_PAYMENT = $testUrl
$env:NODE_ENV = 'test'
