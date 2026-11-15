$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

# Test-only credentials for the throwaway container (see docker-compose.payment-test.yml).
$testUrl = 'postgresql://handygo_test:handygo_test_pw@localhost:55433/handygo_hg51_payment_test'
$env:PAYMENT_TEST_DATABASE_URL = $testUrl
$env:DATABASE_URL_PAYMENT = $testUrl
$env:DIRECT_URL_PAYMENT = $testUrl
$env:DATABASE_URL_WALLET = $testUrl
$env:DIRECT_URL_WALLET = $testUrl
$env:DATABASE_URL_ORDER = $testUrl
$env:DIRECT_URL_ORDER = $testUrl
$env:RABBITMQ_URL = 'amqp://handygo_test:handygo_test_pw@localhost:56674'
$env:RABBITMQ_EXCHANGE = 'handygo-payment-test.events'
$env:TOPUP_MOCK_ENABLED = 'true'
$env:NODE_ENV = 'test'
