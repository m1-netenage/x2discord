/**
 * Lightweight GUI (web page) to start/stop the X→Discord watcher
 * and watch logs in real time. Run with `npm run gui` then open:
 *   http://localhost:3000
 */
import http from "http";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { URL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, "./x2discord.log");
const PID_FILE = path.resolve(__dirname, "./x2discord.pid");
const PLAYWRIGHT_MODULE_DIR = path.resolve(__dirname, "./node_modules/playwright");
const PLAYWRIGHT_MARKER = path.resolve(__dirname, "./.playwright-installed");
const PORT = Number(process.env.GUI_PORT || 3000);
const MAX_LOG_BYTES = Number(process.env.MAX_LOG_BYTES || 5 * 1024 * 1024);
const KEEP_LOG_BYTES = Number(process.env.KEEP_LOG_BYTES || 1 * 1024 * 1024);
const OVERLAY_MAX_MESSAGES = 200;
let HIGHLIGHT_HANDLES = (process.env.HIGHLIGHT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ENV_PATH = path.resolve(__dirname, ".env");
const ENV_DEFAULTS = {
  DISCORD_WEBHOOK_URL: "",
  HASHTAG: "animaymg",
  POLL_SECONDS: "30",
  MAX_TEXT_LEN: "0",
  HIGHLIGHT_IDS: "",
};

const ensureEnvFile = () => {
  if (fs.existsSync(ENV_PATH)) return;
  const header = [
    "# Local config for x2discord",
    "# Auto-generated on GUI startup if missing.",
    "# Keep secrets private and do not commit this file.",
    "",
  ].join("\n");
  const body = Object.entries(ENV_DEFAULTS)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(ENV_PATH, `${header}${body}\n`);
};

const trimLogIfNeeded = () => {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const size = fs.statSync(LOG_FILE).size;
    if (!Number.isFinite(MAX_LOG_BYTES) || MAX_LOG_BYTES <= 0) return;
    if (size <= MAX_LOG_BYTES) return;
    const keep = Number.isFinite(KEEP_LOG_BYTES) && KEEP_LOG_BYTES > 0
      ? KEEP_LOG_BYTES
      : Math.floor(MAX_LOG_BYTES / 2);
    const data = fs.readFileSync(LOG_FILE, "utf8");
    const tail = data.slice(-keep);
    const cut = tail.indexOf("\n");
    const normalized = cut >= 0 ? tail.slice(cut + 1) : tail;
    fs.writeFileSync(LOG_FILE, `[gui] log trimmed at ${new Date().toISOString()}\n${normalized}`);
  } catch {
    // keep logging best-effort; never crash GUI due to log maintenance
  }
};

const appendLogLine = (line) => {
  trimLogIfNeeded();
  fs.appendFile(LOG_FILE, `${line}\n`, () => {});
};

const loadEnvLines = () => {
  if (!fs.existsSync(ENV_PATH)) return [];
  return fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
};

const saveEnvHighlight = (handles) => {
  const target = `HIGHLIGHT_IDS=${handles.join(",")}`;
  const lines = loadEnvLines();
  let replaced = false;
  const out = lines.map((line) => {
    if (/^\s*HIGHLIGHT_IDS\s*=/.test(line)) {
      replaced = true;
      return target;
    }
    return line;
  });
  if (!replaced) out.push(target);
  fs.writeFileSync(ENV_PATH, out.filter((l, idx, arr) => idx === arr.length - 1 ? l.trim() !== "" ? l : "" : true).join("\n") + "\n");
};

const ENV_KEYS = ["DISCORD_WEBHOOK_URL", "HASHTAG", "POLL_SECONDS", "MAX_TEXT_LEN", "HIGHLIGHT_IDS"];

const parseEnv = () => {
  const values = Object.create(null);
  for (const k of ENV_KEYS) values[k] = ENV_DEFAULTS[k] ?? "";
  for (const line of loadEnvLines()) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && ENV_KEYS.includes(m[1])) values[m[1]] = m[2];
  }
  return values;
};

ensureEnvFile();

// 初期値を .env から強制ロードして、環境変数に反映
const BOOT_ENV = parseEnv();
if (BOOT_ENV.HIGHLIGHT_IDS) {
  HIGHLIGHT_HANDLES = BOOT_ENV.HIGHLIGHT_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
Object.assign(process.env, BOOT_ENV);

const saveEnvValues = (patch) => {
  const lines = loadEnvLines();
  const map = parseEnv();
  Object.assign(map, patch);
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
    if (m && ENV_KEYS.includes(m[1])) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push(`${m[1]}=${map[m[1]] ?? ""}`);
    } else {
      out.push(line);
    }
  }
  for (const key of ENV_KEYS) {
    if (!seen.has(key)) out.push(`${key}=${map[key] ?? ""}`);
  }
  fs.writeFileSync(ENV_PATH, out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "") + "\n");
};

let child = null;
let currentMode = "normal"; // "normal" | "login"
const sseClients = new Set();
const overlayClients = new Set();
const overlayMessages = [];
let loginPending = false;

const removeGuiPidFile = () => {
  try {
    const guiPidPath = path.resolve(__dirname, "./gui.pid");
    if (fs.existsSync(guiPidPath)) fs.unlinkSync(guiPidPath);
  } catch {
    // ignore
  }
};

const runningPid = () => {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    if (!Number.isFinite(pid)) return null;
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
};

const findWatcherPids = () => {
  // `pgrep` is Unix-only. On Windows this path can cause flashing shell windows
  // when `/status` is polled frequently by the GUI.
  if (process.platform === "win32") return [];
  try {
    const out = execSync("pgrep -f \"node .*x2discord.mjs\"", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
    if (!out) return [];
    return out
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
};

const readLastLines = (filePath, maxLines = 200) => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return data.slice(-maxLines).filter(Boolean);
};

const broadcastLog = (line) => {
  for (const res of sseClients) {
    res.write(`data: ${line}\n\n`);
  }
};

const broadcastOverlay = (msg) => {
  const data = JSON.stringify(msg);
  for (const res of overlayClients) {
    res.write(`data: ${data}\n\n`);
  }
};

const pushOverlayMessage = (msg) => {
  overlayMessages.push(msg);
  if (overlayMessages.length > OVERLAY_MAX_MESSAGES) overlayMessages.shift();
  broadcastOverlay(msg);
};

const handleStream = (stream, label) => {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    const tagged = `[${label}] ${line}`;
    appendLogLine(tagged);
    broadcastLog(tagged);
  });
};

const ensureWatcherDeps = () => {
  appendLogLine("[gui] checking runtime dependencies...");
  if (fs.existsSync(PLAYWRIGHT_MODULE_DIR)) return;
  appendLogLine("[gui] playwright package not found. running npm ci...");
  try {
    const out = execSync("npm ci", {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    if ((out || "").trim()) {
      appendLogLine("[gui] npm ci completed");
    }
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : "";
    const stdout = e?.stdout ? String(e.stdout) : "";
    if (stdout.trim()) appendLogLine(`[gui] npm ci stdout: ${stdout.trim().slice(0, 1200)}`);
    if (stderr.trim()) appendLogLine(`[gui] npm ci stderr: ${stderr.trim().slice(0, 1200)}`);
    throw new Error("依存インストールに失敗しました。ネット接続と npm を確認してください。");
  }
  if (!fs.existsSync(PLAYWRIGHT_MODULE_DIR)) {
    throw new Error("playwright のインストール確認に失敗しました。");
  }
};

const ensureChromiumRuntime = () => {
  if (fs.existsSync(PLAYWRIGHT_MARKER)) return;
  appendLogLine("[gui] preparing Playwright Chromium (first-time setup, may take a few minutes)...");
  try {
    execSync("npx playwright install chromium", {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    fs.writeFileSync(PLAYWRIGHT_MARKER, "");
    appendLogLine("[gui] Playwright Chromium setup completed");
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : "";
    const stdout = e?.stdout ? String(e.stdout) : "";
    if (stdout.trim()) appendLogLine(`[gui] chromium setup stdout: ${stdout.trim().slice(0, 1200)}`);
    if (stderr.trim()) appendLogLine(`[gui] chromium setup stderr: ${stderr.trim().slice(0, 1200)}`);
    throw new Error("Chromium セットアップに失敗しました。");
  }
};

const startWatcher = ({ loginMode = false } = {}) => {
  if (child || runningPid()) throw new Error("既に起動しています");
  appendLogLine(`[gui] start requested mode=${loginMode ? "login" : "normal"}`);
  ensureWatcherDeps();
  ensureChromiumRuntime();
  appendLogLine("[gui] starting watcher process...");

  const env = {
    ...process.env,
    INIT_LOGIN: loginMode ? "1" : "0",
    HEADLESS: loginMode ? "false" : process.env.HEADLESS || "true",
  };

  const proc = spawn(process.execPath, ["--env-file=.env", "x2discord.mjs"], {
    env,
    cwd: __dirname,
    stdio: loginMode ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });

  child = proc;
  currentMode = loginMode ? "login" : "normal";
  loginPending = loginMode;
  fs.writeFileSync(PID_FILE, String(proc.pid));

  handleStream(proc.stdout, "out");
  handleStream(proc.stderr, "err");

  proc.on("exit", (code, signal) => {
    const msg = `[gui] watcher exited code=${code ?? "null"} signal=${
      signal ?? "null"
    }`;
    appendLogLine(msg);
    broadcastLog(msg);
    child = null;
    currentMode = "normal";
    loginPending = false;
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  });

  return proc.pid;
};

const stopWatcher = () => {
  // 優先: 現在管理下のchild
  if (child) {
    child.kill();
    return true;
  }
  // GUI再起動などでchildが失われた場合でもpidファイルが残っていれば止める
  const pid = runningPid();
  if (pid) {
    try {
      process.kill(pid);
      return true;
    } catch {
      return false;
    }
  }
  // 最後の手段: プロセス名ベースでx2discord.mjsを止める
  const pids = findWatcherPids();
  let killed = false;
  for (const p of pids) {
    try {
      process.kill(p);
      killed = true;
    } catch {
      /* ignore */
    }
  }
  return killed;
};

const completeLogin = () => {
  if (!child || !loginPending) throw new Error("ログイン待ちのプロセスがありません");
  if (child.stdin?.writable) {
    child.stdin.write("\n");
    child.stdin.end();
    loginPending = false;
    return true;
  }
  throw new Error("stdin に書き込めません");
};

const json = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const readBody = async (req) =>
  await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

const handleRoot = (res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>x2discord GUI</title>
    <style>
      :root { font-family: "Inter", system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; }
      body { margin: 0; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .panel { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
      button { background: #2563eb; color: #fff; border: none; padding: 10px 14px; margin-right: 8px; border-radius: 8px; font-weight: 600; cursor: pointer; }
      button.secondary { background: #1f2937; color: #cbd5e1; }
      button.danger { background: #b91c1c; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      #status { margin: 8px 0 16px; font-weight: 700; }
      #logs { background: #0b1220; border: 1px solid #1f2937; border-radius: 8px; padding: 12px; height: 360px; overflow-y: auto; font-family: "SFMono-Regular", ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.4; white-space: pre-wrap; }
      .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
      .pill.on { background: #10b981; color: #052e16; }
      .pill.off { background: #f59e0b; color: #422006; }
      .hl { font-weight: 800; padding: 0 2px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>x2discord</h1>
      <div id="status">loading...</div>
      <div style="margin-bottom: 16px;">
        <button id="startBtn">Start (headless)</button>
        <button id="loginBtn" class="secondary">Start for Login</button>
        <button id="stopBtn" class="danger">Stop</button>
        <button id="shutdownBtn" class="danger">Stop & Exit</button>
        <button id="loginDoneBtn" class="secondary">ログイン完了 → 保存</button>
      </div>
      <div class="panel" style="background:#0b1220; margin-bottom:16px;">
        <div style="font-weight:700; margin-bottom:6px;">配信用オーバーレイ (OBS)</div>
        <div style="font-size:13px; color:#cbd5e1; line-height:1.5;">
          - ブラウザソースURL: <code>http://localhost:3000/overlay</code><br/>
          - CSS: リポジトリの <code>overlay-theme.css</code> をコピペ（変更時は貼り直し）<br/>
          - 反映後はブラウザソースをリロードしてください
        </div>
      </div>
      <div class="panel" style="background:#0b1220; margin-bottom:16px;">
        <div style="margin-bottom:8px; font-weight:700;">環境設定 (.env に保存)</div>
        <label style="display:block; margin:6px 0 4px;">DISCORD_WEBHOOK_URL</label>
        <input id="envWebhook" type="text" style="width:100%; padding:8px; border-radius:8px; border:1px solid #1f2937; background:#111827; color:#e2e8f0;" placeholder="https://discord.com/api/webhooks/..." />
        <label style="display:block; margin:10px 0 4px;">HASHTAG (カンマ区切りで複数可)</label>
        <input id="envHashtag" type="text" style="width:100%; padding:8px; border-radius:8px; border:1px solid #1f2937; background:#111827; color:#e2e8f0;" placeholder="#foo,#bar" />
        <div style="display:flex; gap:12px; margin-top:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:140px;">
            <label style="display:block; margin-bottom:4px;">POLL_SECONDS</label>
            <input id="envPoll" type="number" min="5" step="5" style="width:100%; padding:8px; border-radius:8px; border:1px solid #1f2937; background:#111827; color:#e2e8f0;" placeholder="30" />
          </div>
          <div style="flex:1; min-width:140px;">
            <label style="display:block; margin-bottom:4px;">MAX_TEXT_LEN</label>
            <input id="envMaxLen" type="number" min="0" step="10" style="width:100%; padding:8px; border-radius:8px; border:1px solid #1f2937; background:#111827; color:#e2e8f0;" placeholder="0=無制限" />
          </div>
        </div>
        <div style="margin-top:10px;">
          <button id="envSaveBtn">.envに保存</button>
          <span id="envMsg" style="margin-left:8px; font-size:12px; color:#94a3b8;"></span>
        </div>
      </div>
      <div class="panel" style="background:#0b1220; margin-bottom:16px;">
        <div style="margin-bottom:8px; font-weight:700;">ハイライトするハンドル（カンマ区切り）</div>
        <input id="hlInput" type="text" style="width:100%; padding:8px; border-radius:8px; border:1px solid #1f2937; background:#111827; color:#e2e8f0;" placeholder="foo,bar,baz" />
        <div style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button id="hlSaveBtn">保存（.envにも保存）</button>
          <span id="hlMsg" style="font-size:12px; color:#94a3b8;"></span>
        </div>
      </div>
      <div id="logs"></div>
    </div>
    <script>
      const highlightHandles = ${JSON.stringify(HIGHLIGHT_HANDLES)};
      const colors = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#a855f7"];
      const colorMap = new Map();
      const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      // エスケープ対象をシンプルにして構文エラーを防ぐ（ドル波括弧を避けた安全版）
      const regEsc = (s) => s.replace(/[-[\\]{}()*+?.,\\\\^$|#\\s]/g, "\\\\$&");

      const statusEl = document.getElementById("status");
      const logsEl = document.getElementById("logs");
      const startBtn = document.getElementById("startBtn");
      const stopBtn = document.getElementById("stopBtn");
      const shutdownBtn = document.getElementById("shutdownBtn");
      const loginBtn = document.getElementById("loginBtn");
      const loginDoneBtn = document.getElementById("loginDoneBtn");
      const hlInput = document.getElementById("hlInput");
      const hlSaveBtn = document.getElementById("hlSaveBtn");
      const hlMsg = document.getElementById("hlMsg");
      const envWebhook = document.getElementById("envWebhook");
      const envHashtag = document.getElementById("envHashtag");
      const envPoll = document.getElementById("envPoll");
      const envMaxLen = document.getElementById("envMaxLen");
      const envSaveBtn = document.getElementById("envSaveBtn");
      const envMsg = document.getElementById("envMsg");
      const envInputs = [envWebhook, envHashtag, envPoll, envMaxLen];

      const updateStatus = async () => {
        const res = await fetch("/status").then((r) => r.json());
        const pill = res.running
          ? '<span class="pill on">RUNNING</span>'
          : '<span class="pill off">STOPPED</span>';
        const mode = res.mode === "login" ? "loginモード" : "通常";
        const pid = res.pid ? \`pid=\${res.pid}\` : "";
        const loginWait = res.loginPending ? "（ログイン後に「保存」ボタンを押す）" : "";
        statusEl.innerHTML = \`\${pill} \${mode} \${pid} \${loginWait}\`;
        startBtn.disabled = res.running;
        loginBtn.disabled = res.running;
        stopBtn.disabled = !res.running;
        shutdownBtn.disabled = false;
        loginDoneBtn.disabled = !(res.running && res.mode === "login");
        const active = document.activeElement;
        const envEditing = envInputs.includes(active);
        const hlEditing = active === hlInput;
        if (!envEditing && res.env) {
          envWebhook.value = res.env.DISCORD_WEBHOOK_URL || "";
          envHashtag.value = res.env.HASHTAG || "";
          envPoll.value = res.env.POLL_SECONDS || "";
          envMaxLen.value = res.env.MAX_TEXT_LEN || "";
        }
        if (!hlEditing) {
          const envHl =
            (res.env && res.env.HIGHLIGHT_IDS && res.env.HIGHLIGHT_IDS.split(",").map((s) => s.trim()).filter(Boolean)) ||
            null;
          const src = Array.isArray(res.highlight) && res.highlight.length ? res.highlight : envHl;
          if (src) {
            highlightHandles.length = 0;
            highlightHandles.push(...src);
            hlInput.value = src.join(", ");
          }
        }
      };

      startBtn.onclick = () =>
        fetch("/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: false }) }).then(updateStatus);
      loginBtn.onclick = () =>
        fetch("/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: true }) }).then(updateStatus);
      stopBtn.onclick = () =>
        fetch("/stop", { method: "POST" }).then(updateStatus);
      shutdownBtn.onclick = async () => {
        await fetch("/shutdown", { method: "POST" });
        statusEl.textContent = "GUI stopped. You can close this tab.";
      };
      loginDoneBtn.onclick = () =>
        fetch("/login/complete", { method: "POST" }).then(updateStatus);
      hlSaveBtn.onclick = async () => {
        const handles = hlInput.value.trim();
        const res = await fetch("/highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handles, persist: true }),
        }).then((r) => r.json());
        if (res.ok) {
          highlightHandles.length = 0;
          highlightHandles.push(...res.highlight);
          hlMsg.textContent = ".envに保存しました";
          setTimeout(() => (hlMsg.textContent = ""), 1500);
        } else {
          hlMsg.textContent = res.message || "エラー";
        }
      };
      envSaveBtn.onclick = async () => {
        const payload = {
          DISCORD_WEBHOOK_URL: envWebhook.value.trim(),
          HASHTAG: envHashtag.value.trim(),
          POLL_SECONDS: envPoll.value.trim(),
          MAX_TEXT_LEN: envMaxLen.value.trim(),
        };
        const res = await fetch("/env", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());
        if (res.ok) {
          envMsg.textContent = ".envに保存しました";
          setTimeout(() => (envMsg.textContent = ""), 1500);
        } else {
          envMsg.textContent = res.message || "エラー";
        }
      };

      updateStatus();
      setInterval(updateStatus, 2000);

      const evt = new EventSource("/logs");
      const paintLine = (line) => {
        let safe = esc(line);
        for (const [idx, handle] of highlightHandles.entries()) {
          if (!handle) continue;
          const color =
            colorMap.get(handle) || colors[idx % colors.length] || "#f87171";
          colorMap.set(handle, color);
          safe = safe.replace(
            new RegExp(regEsc(handle), "g"),
            '<span class="hl" style="color:' + color + ';">' + handle + "</span>"
          );
        }
        return safe;
      };
      evt.onmessage = (e) => {
        const html = paintLine(e.data) + "<br/>";
        logsEl.insertAdjacentHTML("beforeend", html);
        logsEl.scrollTop = logsEl.scrollHeight;
      };
    </script>
  </body>
</html>
`);
};

const handleStatus = (res) =>
  json(res, 200, {
    running: Boolean(child || runningPid() || findWatcherPids().length),
    pid: child?.pid || runningPid() || findWatcherPids()[0] || null,
    mode: currentMode,
    loginPending,
    highlight: HIGHLIGHT_HANDLES,
    env: parseEnv(),
  });

const handleStart = async (req, res) => {
  try {
    const body = await readBody(req);
    const pid = startWatcher({ loginMode: Boolean(body?.login) });
    json(res, 200, { ok: true, pid });
  } catch (e) {
    json(res, 400, { ok: false, message: e?.message || String(e) });
  }
};

const handleStop = (res) => {
  const stopped = stopWatcher();
  json(res, 200, { ok: stopped });
};

const handleShutdown = (res) => {
  stopWatcher();
  json(res, 200, { ok: true });
  setTimeout(() => {
    removeGuiPidFile();
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    try {
      server.close(() => process.exit(0));
    } catch {
      process.exit(0);
    }
  }, 150);
};

const handleLoginComplete = (res) => {
  try {
    completeLogin();
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 400, { ok: false, message: e?.message || String(e) });
  }
};

const handleHighlight = async (req, res) => {
  try {
    const body = await readBody(req);
    const input = String(body?.handles || "");
    const persist = Boolean(body?.persist);
    HIGHLIGHT_HANDLES = input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (persist) {
      saveEnvHighlight(HIGHLIGHT_HANDLES);
    }
    json(res, 200, { ok: true, highlight: HIGHLIGHT_HANDLES });
  } catch (e) {
    json(res, 400, { ok: false, message: e?.message || String(e) });
  }
};

const handleEnvSave = async (req, res) => {
  try {
    const body = await readBody(req);
    const patch = {};
    for (const key of ENV_KEYS) {
      if (key in (body || {})) patch[key] = String(body[key] ?? "");
    }
    saveEnvValues(patch);
    // 直後の起動に使われるよう、プロセスの env も更新
    Object.assign(process.env, patch);
    // もし監視が走っていれば再起動して新しい設定を反映
    const wasRunning = Boolean(child || runningPid());
    if (wasRunning) {
      stopWatcher();
      startWatcher({ loginMode: false });
    }
    json(res, 200, { ok: true, env: parseEnv() });
  } catch (e) {
    json(res, 400, { ok: false, message: e?.message || String(e) });
  }
};

const handleLogs = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const line of readLastLines(LOG_FILE, 200)) {
    res.write(`data: ${line}\n\n`);
  }

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
};

const handleOverlayMessage = async (req, res) => {
  try {
    const body = await readBody(req);
    if (!body?.content) throw new Error("content is required");
    const msg = {
      id: body.id || Date.now().toString(),
      content: String(body.content),
      username: body.username ? String(body.username) : "",
      handle: body.handle ? String(body.handle) : "",
      avatar_url: body.avatar_url ? String(body.avatar_url) : "",
      ts: Date.now(),
    };
    pushOverlayMessage(msg);
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 400, { ok: false, message: e?.message || String(e) });
  }
};

const handleOverlayStream = (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const m of overlayMessages) {
    res.write(`data: ${JSON.stringify(m)}\n\n`);
  }
  overlayClients.add(res);
  const keepAlive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      // ignore
    }
  }, 15000);
  _req.on("close", () => {
    clearInterval(keepAlive);
    overlayClients.delete(res);
  });
};

const overlayHtml = () => {
  let css = "";
  try {
    css = fs.readFileSync(path.resolve(__dirname, "./overlay-theme.css"), "utf8");
  } catch {
    css = "";
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body style="margin:0;background:transparent;">
  <div class="Chat_chatContainer__N0eOL">
    <div id="msgs" class="Chat_messages__afjga"></div>
  </div>
  <style>.hl{color:#f87171;font-weight:800;}</style>
  <script>
    const box=document.getElementById("msgs");
    const maxKeep=100;
    let highlights=[];
    const escHtml=(s)=>String(s||"")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
    const regEsc=(s)=>s.replace(/[-[\\]{}()*+?.,\\\\^$|#\\s]/g,"\\\\$&");
    const norm=(s)=>String(s||"").replace(/^@/,"").toLowerCase();
    const paint=(text)=>{
      let t=escHtml(text||"");
      for(const h of highlights){
        if(!h) continue;
        const base=norm(h);
        if(!base) continue;
        const re=new RegExp("@?"+regEsc(base),"gi");
        t=t.replace(re,(m)=>'<span class="hl">'+m+'</span>');
      }
      return t;
    };
    async function refreshHighlights(){
      try{
        const d=await fetch("/status").then(r=>r.json());
        if(Array.isArray(d.highlight)) highlights=d.highlight.filter(Boolean);
      }catch(_){}
    }
    refreshHighlights();
    setInterval(refreshHighlights,5000);
    const evt=new EventSource("/overlay/stream");
    evt.onmessage=(e)=>{try{render(JSON.parse(e.data));}catch(_){}}; 
    function render(m){
      const row=document.createElement("div");
      row.className="Chat_message__P69ez";
      if(m.avatar_url){
        const img=document.createElement("img");
        img.src=m.avatar_url;
        row.appendChild(img);
      }
      const handleStr = m.handle || "";
      const userStr = m.username || "";
      const hit = highlights.some(h=> {
        const base=norm(h);
        if(!base) return false;
        return norm(handleStr).includes(base) || norm(userStr).includes(base);
      });
      if(userStr){
        const name=document.createElement("span");
        name.className="Chat_username__5fTg6";
        if(hit) name.classList.add("hl");
        name.textContent=userStr;
        row.appendChild(name);
      }
      const txt=document.createElement("span");
      txt.className="Chat_messageText__k79m4";
      txt.innerHTML=paint(m.content||"");
      row.appendChild(txt);
      row.addEventListener("animationend", ()=>row.remove(), { once: true });
      box.prepend(row);
      while(box.children.length>maxKeep) box.removeChild(box.lastChild);
    }
  </script>
</body></html>`;
};

const handleOverlayPage = (_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(overlayHtml());
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "GET" && url.pathname === "/") return handleRoot(res);
  if (req.method === "GET" && url.pathname === "/status") return handleStatus(res);
  if (req.method === "POST" && url.pathname === "/start") return handleStart(req, res);
  if (req.method === "POST" && url.pathname === "/stop") return handleStop(res);
  if (req.method === "POST" && url.pathname === "/shutdown") return handleShutdown(res);
  if (req.method === "POST" && url.pathname === "/login/complete")
    return handleLoginComplete(res);
  if (req.method === "POST" && url.pathname === "/highlight")
    return handleHighlight(req, res);
  if (req.method === "POST" && url.pathname === "/env")
    return handleEnvSave(req, res);
  if (req.method === "POST" && url.pathname === "/overlay/message")
    return handleOverlayMessage(req, res);
  if (req.method === "GET" && url.pathname === "/overlay/stream")
    return handleOverlayStream(req, res);
  if (req.method === "GET" && url.pathname === "/overlay")
    return handleOverlayPage(req, res);
  if (req.method === "GET" && url.pathname === "/logs") return handleLogs(req, res);
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`[gui] open http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  removeGuiPidFile();
  process.exit(0);
});
process.on("SIGTERM", () => {
  removeGuiPidFile();
  process.exit(0);
});
