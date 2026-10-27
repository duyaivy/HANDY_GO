# Nạp .env.wallet-test vào process hiện tại và chặn nếu đích không phải DB/broker test local.
$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backend '.env.wallet-test'
if (-not (Test-Path $envFile)) { throw "Thiếu $envFile (copy từ scripts/wallet-test.env.template)" }

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2].Trim() }
}

$db = [Uri]($env:DATABASE_URL_WALLET -replace '^postgresql:', 'http:')
$dbName = $db.AbsolutePath.Trim('/')
if ($db.Host -notin @('localhost', '127.0.0.1') -or $db.Port -ne 55432 -or $dbName -notmatch 'test') {
  throw "GUARD: DATABASE_URL_WALLET không phải DB test local (host=$($db.Host) port=$($db.Port) db=$dbName)"
}
$mq = [Uri]($env:RABBITMQ_URL -replace '^amqp:', 'http:')
if ($mq.Host -notin @('localhost', '127.0.0.1') -or $mq.Port -ne 56672) {
  throw "GUARD: RABBITMQ_URL không phải broker test local (host=$($mq.Host) port=$($mq.Port))"
}
$env:WALLET_TEST_GUARD = 'ok'
Write-Host "Guard OK: db=$dbName @ $($db.Host):$($db.Port), rabbit @ $($mq.Host):$($mq.Port)"
