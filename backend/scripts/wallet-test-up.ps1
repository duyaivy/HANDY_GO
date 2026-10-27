$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'wallet-test-env.ps1')
Set-Location (Split-Path -Parent $PSScriptRoot)

docker compose -f docker-compose.wallet-test.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'docker compose up thất bại' }

docker compose -f docker-compose.wallet-test.yml exec -T postgres-test psql -U handygo_test -d handygo_wallet_test -c 'CREATE SCHEMA IF NOT EXISTS wallet_service;'
if ($LASTEXITCODE -ne 0) { throw 'tạo schema thất bại' }

pnpm run prisma:migrate:wallet
if ($LASTEXITCODE -ne 0) { throw 'prisma migrate wallet thất bại' }
Write-Host 'Wallet test infra sẵn sàng.'
