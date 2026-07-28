# Auto-restart wrapper for the bridge.
# Restarts with exponential backoff (3s-60s) on crash.

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = "$projectDir\logs"
$logFile = "$logDir\restart.log"
$interval = 3

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
    param([string]$msg)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $msg" | Out-File -FilePath $logFile -Append
}

Write-Log "=== Bridge monitor started ==="

while ($true) {
    Write-Log "Starting bridge..."
    $process = Start-Process -FilePath "node" -ArgumentList "build/main.js" -WorkingDirectory $projectDir -NoNewWindow -PassThru -RedirectStandardOutput "$logDir\stdout.log" -RedirectStandardError "$logDir\stderr.log"
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    Write-Log "Bridge exited with code $exitCode. Restarting in ${interval}s..."
    Start-Sleep -Seconds $interval
    $interval = [Math]::Min($interval * 2, 60)
}
