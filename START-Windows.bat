@echo off
setlocal
cd /d "%~dp0"

set "GUI_LOG_FILE=gui.log"
set "LAUNCH_LOG_FILE=launcher.log"
set "GUI_URL=http://localhost:3000"

echo [x2discord] launcher started: %DATE% %TIME%>"%LAUNCH_LOG_FILE%"
echo [x2discord] cwd=%CD%>>"%LAUNCH_LOG_FILE%"

where node >nul 2>&1
if errorlevel 1 goto :no_node

echo [x2discord] launching gui.mjs>>"%LAUNCH_LOG_FILE%"
start "" /min cmd /c "cd /d ""%~dp0"" && node gui.mjs >> ""%GUI_LOG_FILE%"" 2>&1"
if errorlevel 1 goto :fail

echo [x2discord] opening browser: %GUI_URL%>>"%LAUNCH_LOG_FILE%"
start "" "%GUI_URL%"
exit /b 0

:no_node
echo [x2discord] ERROR: node command not found>>"%LAUNCH_LOG_FILE%"
echo Node.js 18+ is required. Please install Node.js and retry.
start "" notepad "%LAUNCH_LOG_FILE%"
exit /b 1

:fail
echo [x2discord] ERROR: setup failed (code=%ERRORLEVEL%)>>"%LAUNCH_LOG_FILE%"
echo Launcher failed. Check launcher.log for details.
start "" notepad "%LAUNCH_LOG_FILE%"
exit /b 1
