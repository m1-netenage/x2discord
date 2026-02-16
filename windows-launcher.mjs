import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAUNCH_LOG_FILE = path.resolve(__dirname, "launcher.log");
const GUI_PID_FILE = path.resolve(__dirname, "gui.pid");

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

const launchGui = () => {
  // Minimal, reliable launch: spawn node gui.mjs detached, hidden.
  // Pipe stdout/stderr to gui.log for debugging while keeping it off the console.
  const guiLog = fs.openSync(path.resolve(__dirname, "gui.log"), "a");
  const child = spawn(process.execPath, [path.resolve(__dirname, "gui.mjs")], {
    cwd: __dirname,
    detached: true,
    stdio: ["ignore", guiLog, guiLog],
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(guiLog);
  fs.writeFileSync(GUI_PID_FILE, String(child.pid));
  log(`[x2discord] gui started pid=${child.pid}`);
};

try {
  fs.writeFileSync(LAUNCH_LOG_FILE, `[x2discord] launcher started: ${new Date().toISOString()}\n`);
  log(`[x2discord] cwd=${__dirname}`);
  const existingPid = readGuiPid();
  if (existingPid) {
    log(`[x2discord] gui already running pid=${existingPid}`);
    process.exit(0);
  }
  // stale pid file cleanup + launch fresh GUI
  try {
    if (fs.existsSync(GUI_PID_FILE)) fs.unlinkSync(GUI_PID_FILE);
  } catch {
    // ignore
  }
  launchGui();
} catch (e) {
  log(`[x2discord] launcher failed: ${e?.message || e}`);
  process.exit(1);
}
