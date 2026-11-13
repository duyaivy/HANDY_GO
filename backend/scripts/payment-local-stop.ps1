param([switch]$KeepDependencies)

$ErrorActionPreference = 'Stop'
$backendPath = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $backendPath
$terminalStatePath = Join-Path $backendPath 'logs/payment-local-terminals.clixml'
$failedRecords = @()

# Only stop windows registered by the launcher. Verify creation time against PID reuse.
if (Test-Path -LiteralPath $terminalStatePath) {
    foreach ($record in @(Import-Clixml -LiteralPath $terminalStatePath)) {
        $terminal = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
        if (!$terminal) { continue }
        if ($terminal.ProcessName -ne 'powershell' -or
            $terminal.StartTime.ToUniversalTime().Ticks -ne $record.StartTimeTicks) {
            Write-Warning "Skipping reused PID $($record.Id)."
            continue
        }
        # /T also stops Node and Docker log followers belonging to this terminal.
        & taskkill.exe /PID $record.Id /T /F
        if ($LASTEXITCODE -ne 0) {
            $failedRecords += $record
            Write-Warning "Could not close $($record.Title)."
        } else {
            Write-Host "Stopped $($record.Title)"
        }
    }
    if ($failedRecords.Count) {
        $failedRecords | Export-Clixml -LiteralPath $terminalStatePath
    } else {
        Remove-Item -LiteralPath $terminalStatePath
    }
} else {
    Write-Host 'No terminals registered by payment-local-start.ps1.'
}

if (!$KeepDependencies) {
    docker compose -f docker-compose.payment-local.yml stop
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop local Docker dependencies.' }
}
if ($failedRecords.Count) { throw 'Some terminals could not be stopped. See warnings above.' }
Write-Host 'Payment local stopped. Existing database volumes are preserved.'
