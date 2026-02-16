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
  // Launch via temporary VBScript to create a fully detached process
  // that survives parent CMD close. Output is redirected to gui.log.
  const nodeExe = process.execPath.replace(/"/g, '""');
  const script = path.resolve(__dirname, "gui.mjs").replace(/"/g, '""');
  const guiLog = path.resolve(__dirname, "gui.log").replace(/"/g, '""');
  const vbsPath = path.resolve(__dirname, "launch-gui.vbs");

  const vbs = [
    'Set oShell = CreateObject("WScript.Shell")',
    `cmd = "cmd /c """"${nodeExe}"" ""${script}"" >> ""${guiLog}"" 2>&1"""`,
    'oShell.Run cmd, 0, False', // 0=hidden window, False=do not wait
  ].join("\r\n");
  fs.writeFileSync(vbsPath, vbs);

  const child = spawn("wscript.exe", [vbsPath], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  log(`[x2discord] gui launch script started (pid=${child.pid})`);
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
