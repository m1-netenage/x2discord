@echo off
setlocal
cd /d "%~dp0"

set "GUI_LOG_FILE=gui.log"
set "LAUNCH_LOG_FILE=launcher.log"
set "GUI_URL=http://localhost:3000"
set "PLAYWRIGHT_MARKER=.playwright-installed"

echo [x2discord] launcher started: %DATE% %TIME%>"%LAUNCH_LOG_FILE%"
echo [x2discord] cwd=%CD%>>"%LAUNCH_LOG_FILE%"

where node >nul 2>&1
if errorlevel 1 goto :no_node

where npm >nul 2>&1
if errorlevel 1 goto :no_npm

if exist "node_modules\playwright" goto :skip_npm_ci
echo [x2discord] running: npm ci>>"%LAUNCH_LOG_FILE%"
call npm ci >>"%LAUNCH_LOG_FILE%" 2>&1
if errorlevel 1 goto :fail
:skip_npm_ci

if exist "%PLAYWRIGHT_MARKER%" goto :skip_pw_install
echo [x2discord] running: npx playwright install chromium>>"%LAUNCH_LOG_FILE%"
call npx playwright install chromium >>"%LAUNCH_LOG_FILE%" 2>&1
if errorlevel 1 goto :fail
type nul > "%PLAYWRIGHT_MARKER%"
:skip_pw_install

echo [x2discord] launching gui.mjs>>"%LAUNCH_LOG_FILE%"
start "" /min cmd /c "cd /d ""%~dp0"" && node gui.mjs >> ""%GUI_LOG_FILE%"" 2>&1"
if errorlevel 1 goto :fail

echo [x2discord] opening browser: %GUI_URL%>>"%LAUNCH_LOG_FILE%"
start "" "%GUI_URL%"
exit /b 0

:no_node
echo [x2discord] ERROR: node command not found>>"%LAUNCH_LOG_FILE%"
echo Node.js 18+ is required. Please install Node.js and retry.
pause
exit /b 1

:no_npm
echo [x2discord] ERROR: npm command not found>>"%LAUNCH_LOG_FILE%"
echo npm command not found. Please reinstall Node.js and retry.
pause
exit /b 1

:fail
echo [x2discord] ERROR: setup failed (code=%ERRORLEVEL%)>>"%LAUNCH_LOG_FILE%"
echo Setup failed. Check launcher.log for details.
pause
exit /b 1
