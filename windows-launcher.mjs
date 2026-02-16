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
  // Use PowerShell Start-Process to fully detach and redirect output to gui.log.
  const nodePath = process.execPath.replace(/`/g, "``");
  const scriptPath = path.resolve(__dirname, "gui.mjs").replace(/`/g, "``");
  const workdir = __dirname.replace(/`/g, "``");
  const guiLog = path.resolve(__dirname, "gui.log").replace(/`/g, "``");
  const guiPid = GUI_PID_FILE.replace(/`/g, "``");
  const ps = `
$ErrorActionPreference = 'Stop'
$p = Start-Process -FilePath "${nodePath}" -ArgumentList "${scriptPath}" -WorkingDirectory "${workdir}" -WindowStyle Hidden -RedirectStandardOutput "${guiLog}" -RedirectStandardError "${guiLog}" -PassThru
Set-Content -Path "${guiPid}" -Value $p.Id -Encoding ascii
Add-Content -Path "${LAUNCH_LOG_FILE.replace(/`/g, "``")}" -Value "[x2discord] gui started pid=$($p.Id)"
`.trim();

  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  log(`[x2discord] gui launch command issued via PowerShell (pid=${child.pid})`);
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
