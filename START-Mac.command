#!/bin/bash
set -euo pipefail

# Finder からダブルクリックするだけで GUI を立ち上げてブラウザを開くランチャー
# 監視の開始/停止、ログ閲覧、ログイン保存は GUI 上で完結する。

cd "$(dirname "$0")"
trap '' SIGHUP

GUI_PID_FILE="./gui.pid"
GUI_LOG_FILE="./gui.log"
GUI_URL="http://localhost:3000"
PLAYWRIGHT_MARKER=".playwright-installed"

notify() {
  local msg="$1"
  /usr/bin/osascript -e "display notification \"${msg}\" with title \"x2discord\"" >/dev/null 2>&1 || true
}

is_running() {
  if [[ -f "$GUI_PID_FILE" ]]; then
    local pid
    pid="$(cat "$GUI_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

start_gui() {
  echo "[x2discord] launching GUI server... logs -> $GUI_LOG_FILE"
  nohup node gui.mjs >> "$GUI_LOG_FILE" 2>&1 &
  local new_pid=$!
  echo "$new_pid" > "$GUI_PID_FILE"
  notify "GUI 起動 (pid=${new_pid})"
}

ensure_runtime() {
  if ! command -v node >/dev/null 2>&1; then
    echo "[x2discord] Node.js が見つかりません。Node.js (LTS) を自動インストールします。"
    notify "Node.js (LTS) をセットアップ中"

    if ! command -v curl >/dev/null 2>&1; then
      echo "[x2discord] curl が見つかりません。Xcode Command Line Tools を先に導入してください。"
      notify "curl が見つかりません"
      exit 1
    fi

    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
      if ! curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; then
        echo "[x2discord] nvm のインストールに失敗しました。"
        notify "nvm インストール失敗"
        exit 1
      fi
    fi

    if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
      echo "[x2discord] nvm の初期化ファイルが見つかりません。"
      notify "nvm 初期化失敗"
      exit 1
    fi

    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"

    if ! command -v nvm >/dev/null 2>&1; then
      echo "[x2discord] nvm コマンドを読み込めませんでした。"
      notify "nvm 読み込み失敗"
      exit 1
    fi

    if ! nvm install --lts; then
      echo "[x2discord] Node.js LTS のインストールに失敗しました。"
      notify "Node.js LTS インストール失敗"
      exit 1
    fi

    nvm use --lts >/dev/null 2>&1 || true
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "[x2discord] Node.js が有効になっていません。再実行してください。"
    notify "Node.js セットアップ未完了"
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "[x2discord] npm が見つかりません。Node.js を再インストールしてください。"
    notify "npm が見つかりません"
    exit 1
  fi

  echo "[x2discord] node=$(node -v) npm=$(npm -v)"

  if [[ ! -d "./node_modules/playwright" ]]; then
    echo "[x2discord] 初回セットアップ: npm ci"
    npm ci
  fi

  if [[ ! -f "$PLAYWRIGHT_MARKER" ]]; then
    echo "[x2discord] 初回セットアップ: Chromium (Playwright) を準備"
    npx playwright install chromium
    touch "$PLAYWRIGHT_MARKER"
  fi
}

# すでにGUIが動いていたら再起動して最新のHTMLを読み込ませる
if pid="$(is_running)"; then
  echo "[x2discord] GUI already running (pid=$pid) -> restarting"
  kill "$pid" 2>/dev/null || true
  sleep 0.3
fi

ensure_runtime
start_gui

# ブラウザで GUI を開く
open "$GUI_URL" >/dev/null 2>&1 || true

# Finder から起動した場合にターミナルウィンドウを自動で閉じる
if [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" && -n "${TERM_SESSION_ID:-}" ]]; then
  /usr/bin/osascript -e 'tell application "Terminal" to if (count of windows) > 0 then close front window' >/dev/null 2>&1 || true
fi

exit 0
