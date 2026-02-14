@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "GUI_PID_FILE=gui.pid"
set "GUI_LOG_FILE=gui.log"
set "GUI_URL=http://localhost:3000"
set "PLAYWRIGHT_MARKER=.playwright-installed"

where node >nul 2>&1
if errorlevel 1 (
  echo [x2discord] Node.js が見つかりません。Node.js 18+ をインストールしてください。
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [x2discord] npm が見つかりません。Node.js を再インストールしてください。
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo [x2discord] 初回セットアップ: npm ci
  call npm ci
  if errorlevel 1 goto :fail
)

if not exist "%PLAYWRIGHT_MARKER%" (
  echo [x2discord] 初回セットアップ: Chromium ^(Playwright^) を準備
  call npx playwright install chromium
  if errorlevel 1 goto :fail
  type nul > "%PLAYWRIGHT_MARKER%"
)

if exist "%GUI_PID_FILE%" (
  set /p OLD_PID=<"%GUI_PID_FILE%"
  if not "!OLD_PID!"=="" taskkill /PID !OLD_PID! /F >nul 2>&1
)

echo [x2discord] launching GUI server... logs -^> %GUI_LOG_FILE%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath 'node' -ArgumentList 'gui.mjs' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%GUI_LOG_FILE%' -RedirectStandardError '%GUI_LOG_FILE%' -PassThru; [IO.File]::WriteAllText('%GUI_PID_FILE%', $p.Id)"
if errorlevel 1 goto :fail

:open
start "" "%GUI_URL%"
exit /b 0

:fail
echo [x2discord] セットアップに失敗しました。ログを確認してください。
pause
exit /b 1
