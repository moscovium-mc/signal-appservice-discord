@echo off
title Signal Bridge Stopper
echo Stopping bridge...
taskkill /f /fi "WINDOWTITLE eq Signal Bridge" /im powershell.exe 2>nul
taskkill /f /fi "WINDOWTITLE eq Signal Bridge" /im cmd.exe 2>nul
echo Stopping signal-cli daemon...
taskkill /f /fi "WINDOWTITLE eq signal-cli daemon" /im powershell.exe 2>nul
taskkill /f /im java.exe 2>nul
echo Done.
pause
