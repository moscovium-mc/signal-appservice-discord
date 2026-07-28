@echo off
REM === EDIT THESE for your system ===
set JAVA_HOME=C:\Path\To\Java-21+
set ACCOUNT=+15551234567
set CLI="C:\Path\To\signal-cli\bin\signal-cli.bat"

REM Kill stale daemon on port 7583
netstat -ano | findstr "127.0.0.1:7583" >nul 2>&1
if %errorlevel% equ 0 (
    taskkill /f /im java.exe >nul 2>&1
    timeout /t 3 /nobreak >nul
)

%CLI% -a %ACCOUNT% daemon --tcp 127.0.0.1:7583 > "%~dp0logs\daemon.log" 2>&1