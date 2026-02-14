@echo off
setlocal
cd /d "%~dp0"

set "GUI_LOG_FILE=gui.log"
set "LAUNCH_LOG_FILE=launcher.log"
set "GUI_URL=http://localhost:3000"
set "PLAYWRIGHT_MARKER=.playwright-installed"

> "%LAUNCH_LOG_FILE%" echo [x2discord] launcher started: %DATE% %TIME%
>> "%LAUNCH_LOG_FILE%" echo [x2discord] cwd=%CD%

where node >nul 2>&1
if errorlevel 1 (
  echo [x2discord] Node.js が見つかりません。Node.js 18+ をインストールしてください。
  >> "%LAUNCH_LOG_FILE%" echo [x2discord] ERROR: node command not found
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [x2discord] npm が見つかりません。Node.js を再インストールしてください。
  >> "%LAUNCH_LOG_FILE%" echo [x2discord] ERROR: npm command not found
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo [x2discord] 初回セットアップ: npm ci
  >> "%LAUNCH_LOG_FILE%" echo [x2discord] running: npm ci
  call npm ci >> "%LAUNCH_LOG_FILE%" 2>&1
  if errorlevel 1 goto :fail
)

if not exist "%PLAYWRIGHT_MARKER%" (
  echo [x2discord] 初回セットアップ: Chromium ^(Playwright^) を準備
  >> "%LAUNCH_LOG_FILE%" echo [x2discord] running: npx playwright install chromium
  call npx playwright install chromium >> "%LAUNCH_LOG_FILE%" 2>&1
  if errorlevel 1 goto :fail
  type nul > "%PLAYWRIGHT_MARKER%"
)

echo [x2discord] launching GUI server... logs -^> %GUI_LOG_FILE%
>> "%LAUNCH_LOG_FILE%" echo [x2discord] launching gui.mjs
start "" /min cmd /c "cd /d ""%~dp0"" && node gui.mjs >> ""%GUI_LOG_FILE%"" 2>&1"
if errorlevel 1 goto :fail

>> "%LAUNCH_LOG_FILE%" echo [x2discord] opening browser: %GUI_URL%
start "" "%GUI_URL%"
exit /b 0

:fail
echo [x2discord] セットアップに失敗しました。launcher.log を確認してください。
>> "%LAUNCH_LOG_FILE%" echo [x2discord] ERROR: setup failed with exit code %ERRORLEVEL%
pause
exit /b 1
