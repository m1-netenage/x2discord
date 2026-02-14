@echo off
setlocal
cd /d "%~dp0"

set "LAUNCH_LOG_FILE=launcher.log"
set "NODE_EXE="

echo [x2discord] launcher started: %DATE% %TIME%>"%LAUNCH_LOG_FILE%"
echo [x2discord] cwd=%CD%>>"%LAUNCH_LOG_FILE%"

call :resolve_node
if defined NODE_EXE goto :run_launcher

echo [x2discord] node not found. trying install via winget...>>"%LAUNCH_LOG_FILE%"
echo Node.js was not found. Starting automatic install (requires Administrator permission).

where winget >nul 2>&1
if errorlevel 1 goto :no_winget

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'winget' -ArgumentList 'install','-e','--id','OpenJS.NodeJS.LTS','--accept-package-agreements','--accept-source-agreements' -Verb RunAs -Wait"
if errorlevel 1 goto :install_failed

call :resolve_node
if defined NODE_EXE goto :run_launcher

goto :install_failed

:run_launcher
echo [x2discord] using node: %NODE_EXE%>>"%LAUNCH_LOG_FILE%"
"%NODE_EXE%" windows-launcher.mjs
if errorlevel 1 goto :fail
echo [x2discord] opening browser: http://localhost:3000>>"%LAUNCH_LOG_FILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds 700; Start-Process 'http://localhost:3000'" >nul 2>&1
if errorlevel 1 explorer "http://localhost:3000" >nul 2>&1
exit /b 0

:resolve_node
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do (
  set "NODE_EXE=%%I"
  goto :resolve_done
)
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
:resolve_done
exit /b 0

:no_winget
echo [x2discord] ERROR: winget not found>>"%LAUNCH_LOG_FILE%"
echo Could not find winget. Please install Node.js LTS manually from https://nodejs.org/
start "" "https://nodejs.org/"
if exist "launcher.log" start "" notepad "launcher.log"
pause
exit /b 1

:install_failed
echo [x2discord] ERROR: automatic Node.js install failed>>"%LAUNCH_LOG_FILE%"
echo Automatic Node.js install failed. Install Node.js LTS manually from https://nodejs.org/ and retry.
start "" "https://nodejs.org/"
if exist "launcher.log" start "" notepad "launcher.log"
pause
exit /b 1

:fail
echo [x2discord] ERROR: launcher failed (code=%ERRORLEVEL%)>>"%LAUNCH_LOG_FILE%"
echo Launcher failed. Check launcher.log and gui.log for details.
if exist "launcher.log" start "" notepad "launcher.log"
if exist "gui.log" start "" notepad "gui.log"
pause
exit /b 1
