@echo off
REM Edit JAVA_HOME and CLI path for your system
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-25.0.4.7-hotspot
set ACCOUNT=+15594104227
set CLI="%USERPROFILE%\signal-cli\signal-cli-0.14.6\bin\signal-cli.bat"

REM Kill stale daemon on port 7583
netstat -ano | findstr "127.0.0.1:7583" >nul 2>&1
if %errorlevel% equ 0 (
    taskkill /f /im java.exe >nul 2>&1
    timeout /t 3 /nobreak >nul
)

%CLI% -a %ACCOUNT% daemon --tcp 127.0.0.1:7583 > "%~dp0logs\daemon.log" 2>&1