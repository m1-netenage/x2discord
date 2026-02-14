@echo off
setlocal
cd /d "%~dp0"

node windows-launcher.mjs
if errorlevel 1 goto :fail
exit /b 0

:fail
echo Launcher failed. Check launcher.log for details.
if exist "launcher.log" start "" notepad "launcher.log"
pause
exit /b 1
