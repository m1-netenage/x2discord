import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUI_LOG_FILE = path.resolve(__dirname, "gui.log");
const LAUNCH_LOG_FILE = path.resolve(__dirname, "launcher.log");
const GUI_PID_FILE = path.resolve(__dirname, "gui.pid");
const LAUNCH_LOCK_FILE = path.resolve(__dirname, "launcher.lock");
const GUI_URL = "http://localhost:3000";

const log = (line) => {
  fs.appendFileSync(LAUNCH_LOG_FILE, `${line}\n`);
};

const readGuiPid = () => {
  if (!fs.existsSync(GUI_PID_FILE)) return null;
  const raw = fs.readFileSync(GUI_PID_FILE, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
};

const shouldSkipRapidRelaunch = () => {
  const now = Date.now();
  try {
    if (fs.existsSync(LAUNCH_LOCK_FILE)) {
      const last = Number(fs.readFileSync(LAUNCH_LOCK_FILE, "utf8").trim());
      if (Number.isFinite(last) && now - last < 15000) return true;
    }
  } catch {
    // ignore
  }
  try {
    fs.writeFileSync(LAUNCH_LOCK_FILE, String(now));
  } catch {
    // ignore
  }
  return false;
};

const launchGui = () => {
  const fd = fs.openSync(GUI_LOG_FILE, "a");
  const child = spawn(process.execPath, ["gui.mjs"], {
    cwd: __dirname,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(fd);
  fs.writeFileSync(GUI_PID_FILE, String(child.pid));
  log(`[x2discord] gui started pid=${child.pid}`);
};

const openBrowser = () => {
  const opener = spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process '${GUI_URL}'`], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
  log(`[x2discord] browser open requested: ${GUI_URL}`);
};

try {
  fs.writeFileSync(LAUNCH_LOG_FILE, `[x2discord] launcher started: ${new Date().toISOString()}\n`);
  log(`[x2discord] cwd=${__dirname}`);
  if (shouldSkipRapidRelaunch()) {
    log("[x2discord] skip: rapid relaunch detected");
    process.exit(0);
  }
  const existingPid = readGuiPid();
  if (existingPid) {
    log(`[x2discord] gui already running pid=${existingPid}`);
  } else {
    // stale pid file cleanup + launch fresh GUI
    try {
      if (fs.existsSync(GUI_PID_FILE)) fs.unlinkSync(GUI_PID_FILE);
    } catch {
      // ignore
    }
    launchGui();
  }
  openBrowser();
} catch (e) {
  log(`[x2discord] launcher failed: ${e?.message || e}`);
  process.exit(1);
}
