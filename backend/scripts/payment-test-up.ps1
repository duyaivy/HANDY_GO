$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'payment-test-env.ps1')

docker compose --env-file scripts/payment-test.env.template -f docker-compose.payment-test.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'docker compose up thất bại' }

docker compose --env-file scripts/payment-test.env.template -f docker-compose.payment-test.yml exec -T postgres-test psql -U handygo_test -d handygo_hg51_payment_test -c 'CREATE SCHEMA IF NOT EXISTS payment_service;'
if ($LASTEXITCODE -ne 0) { throw 'tạo schema thất bại' }

pnpm.cmd run prisma:migrate:payment
if ($LASTEXITCODE -ne 0) { throw 'prisma migrate payment thất bại' }
pnpm.cmd run prisma:migrate:wallet
if ($LASTEXITCODE -ne 0) { throw 'prisma migrate wallet failed' }
pnpm.cmd run prisma:migrate:order
if ($LASTEXITCODE -ne 0) { throw 'prisma migrate order failed' }
Write-Host 'Payment test infra sẵn sàng (handygo-payment-test, localhost:55433).'
