$ErrorActionPreference = 'Stop'
$backendPath = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $backendPath
foreach ($required in @('.env', '.env.payment-local', 'docker-compose.payment-local.yml')) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing $required" }
}
$services = @('user-trust-service', 'auth-service', 'api-gateway', 'payment-service', 'wallet-service')
foreach ($service in $services) {
    if (!(Test-Path "dist/apps/$service/main.js")) {
        throw "Missing build for $service. Run: npx.cmd nest build $service"
    }
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
Get-Command docker -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Force logs | Out-Null
$terminalStatePath = Join-Path $backendPath 'logs/payment-local-terminals.clixml'
$terminalRecords = @()
if (Test-Path -LiteralPath $terminalStatePath) {
    $terminalRecords = @(Import-Clixml -LiteralPath $terminalStatePath)
}

function Open-ServiceTerminal([string]$Title, [string]$Command) {
    $locationLiteral = "'" + $backendPath.Replace("'", "''") + "'"
    $titleLiteral = "'" + $Title.Replace("'", "''") + "'"
    $script = "Set-Location -LiteralPath $locationLiteral; `$Host.UI.RawUI.WindowTitle = $titleLiteral; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $terminal = Start-Process powershell.exe -WindowStyle Normal -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -PassThru
    $script:terminalRecords += [pscustomobject]@{
        Id = $terminal.Id
        StartTimeTicks = $terminal.StartTime.ToUniversalTime().Ticks
        Title = $Title
    }
    $script:terminalRecords | Export-Clixml -LiteralPath $terminalStatePath
}

# Report readiness back to this launcher while keeping database logs visible.
$statusPath = Join-Path ([IO.Path]::GetTempPath()) ("handygo-db-" + [guid]::NewGuid() + '.status')
$statusLiteral = "'" + $statusPath.Replace("'", "''") + "'"
$dbCommand = @"
try {
    docker compose -f docker-compose.payment-local.yml up -d --wait
    if (`$LASTEXITCODE -ne 0) { throw 'Docker startup failed' }
    Set-Content -LiteralPath $statusLiteral -Value 'ready'
    docker compose -f docker-compose.payment-local.yml logs --follow --tail 50
} catch {
    Set-Content -LiteralPath $statusLiteral -Value 'failed'
    Write-Error `$_
}
"@
Open-ServiceTerminal 'HANDY GO | Database + RabbitMQ' $dbCommand
Write-Host 'Waiting for PostgreSQL and RabbitMQ in the database terminal...'
$deadline = (Get-Date).AddMinutes(3)
try {
    while (!(Test-Path -LiteralPath $statusPath)) {
        if ((Get-Date) -gt $deadline) { throw 'Database startup timed out. Check the database terminal.' }
        Start-Sleep -Milliseconds 500
    }
    if ((Get-Content -LiteralPath $statusPath -Raw).Trim() -ne 'ready') {
        throw 'Database startup failed. Check the database terminal.'
    }
} finally {
    if (Test-Path -LiteralPath $statusPath) { Remove-Item -LiteralPath $statusPath }
}

foreach ($service in $services) {
    $port = @{ 'user-trust-service' = 3002; 'auth-service' = 3001; 'api-gateway' = 3000; 'payment-service' = 3007; 'wallet-service' = 3009 }[$service]
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listeners) {
        $ownerIds = ($listeners.OwningProcess | Select-Object -Unique) -join ', '
        Write-Warning "$service skipped: port $port already in use (PID $ownerIds). Stop the existing instance before relaunching; it may use an older build or different environment."
        continue
    }
    $nodeLiteral = "'" + $nodePath.Replace("'", "''") + "'"
    $serviceCommand = "& $nodeLiteral --env-file=.env --env-file=.env.payment-local dist/apps/$service/main.js"
    if ($service -in @('auth-service', 'user-trust-service')) {
        # Keep existing identity/profile data; only messaging uses payment-local overrides.
        $databaseKey = @{ 'auth-service' = 'DATABASE_URL_AUTH'; 'user-trust-service' = 'DATABASE_URL_USER_TRUST' }[$service]
        $serviceCommand = @"
`$originalDatabase = & $nodeLiteral --env-file=.env -p 'process.env.$databaseKey || process.env.DATABASE_URL || String()'
if (`$LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(`$originalDatabase)) {
    throw 'Missing original database configuration for $service in .env'
}
`$env:$databaseKey = `$originalDatabase
& $nodeLiteral --env-file=.env --env-file=.env.payment-local dist/apps/$service/main.js
"@
    }
    Open-ServiceTerminal "HANDY GO | $service | $port" $serviceCommand
    Write-Host "$service terminal opened (port $port). Check its startup output."
}
