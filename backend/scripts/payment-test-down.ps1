$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
docker compose --env-file scripts/payment-test.env.template -f docker-compose.payment-test.yml down -v
