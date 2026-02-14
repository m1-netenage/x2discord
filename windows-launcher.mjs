import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUI_LOG_FILE = path.resolve(__dirname, "gui.log");
const LAUNCH_LOG_FILE = path.resolve(__dirname, "launcher.log");
const GUI_PID_FILE = path.resolve(__dirname, "gui.pid");
const GUI_URL = "http://localhost:3000";

const log = (line) => {
  fs.appendFileSync(LAUNCH_LOG_FILE, `${line}\n`);
};

const killOldGui = () => {
  if (!fs.existsSync(GUI_PID_FILE)) return;
  const raw = fs.readFileSync(GUI_PID_FILE, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }
  try {
    process.kill(pid);
    log(`[x2discord] stopped old gui pid=${pid}`);
  } catch (e) {
    log(`[x2discord] failed to stop old gui pid=${pid}: ${e?.message || e}`);
  }
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
  const opener = spawn("cmd.exe", ["/c", "start", "", GUI_URL], {
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
  killOldGui();
  launchGui();
  openBrowser();
} catch (e) {
  log(`[x2discord] launcher failed: ${e?.message || e}`);
  process.exit(1);
}
