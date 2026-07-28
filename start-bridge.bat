@echo off
title Signal Bridge
cd /d "%~dp0"

echo [1/3] Starting signal-cli daemon (minimized)...
start "signal-cli daemon" /min cmd /c start-daemon.bat

echo [2/3] Waiting for daemon on port 7583 (up to 30 seconds)...
powershell -Command ^
    "$t = 30; $s = Get-Date; while (-not ($ok = try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 7583); $c.Close(); $true } catch { $false }) -and ((Get-Date)-$s).TotalSeconds -lt $t) { Write-Host '.' -NoNewline; Start-Sleep 1 }; if ($ok) { exit 0 } else { exit 1 }"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Daemon did not start within 30 seconds.
    pause
    exit /b 1
)
echo Daemon is ready.

if not exist "build\main.js" (
    echo [3/3] Building bridge (first run or clean checkout)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Make sure Node.js is installed.
        pause
        exit /b 1
    )
)

echo [3/3] Starting bridge (with auto-restart)...
echo Bridge logs: logs\bridge.log
echo Restart logs: logs\restart.log
echo.
echo Close this window to stop the bridge.
echo.

powershell -ExecutionPolicy Bypass -File run-bridge.ps1

echo Bridge exited. Press any key to close.
pause >nul