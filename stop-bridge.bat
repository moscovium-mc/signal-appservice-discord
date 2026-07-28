@echo off
title Stopping Signal Bridge
echo Stopping bridge and daemon...

:: Kill node (bridge process)
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    taskkill /f /pid %%a 2>nul
)

:: Kill java (signal-cli daemon)
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq java.exe" /fo csv /nh 2^>nul') do (
    taskkill /f /pid %%a 2>nul
)

echo Done.
pause
