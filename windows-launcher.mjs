import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUI_LOG_FILE = path.resolve(__dirname, "gui.log");
const LAUNCH_LOG_FILE = path.resolve(__dirname, "launcher.log");
const GUI_PID_FILE = path.resolve(__dirname, "gui.pid");

const log = (line) => {
  fs.appendFileSync(LAUNCH_LOG_FILE, `${line}\n`);
};

const canConnectGuiPort = () =>
  new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port: 3000 });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    sock.setTimeout(600);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });

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

try {
  fs.writeFileSync(LAUNCH_LOG_FILE, `[x2discord] launcher started: ${new Date().toISOString()}\n`);
  log(`[x2discord] cwd=${__dirname}`);
  const existingPid = readGuiPid();
  if (existingPid) {
    log(`[x2discord] gui already running pid=${existingPid}`);
    process.exit(0);
  }
  canConnectGuiPort()
    .then((portBusy) => {
      if (portBusy) {
        log("[x2discord] gui already running (port 3000 is open)");
        return;
      }
      // stale pid file cleanup + launch fresh GUI
      try {
        if (fs.existsSync(GUI_PID_FILE)) fs.unlinkSync(GUI_PID_FILE);
      } catch {
        // ignore
      }
      launchGui();
    })
    .catch((e) => {
      log(`[x2discord] launcher failed async: ${e?.message || e}`);
      process.exit(1);
    });
} catch (e) {
  log(`[x2discord] launcher failed: ${e?.message || e}`);
  process.exit(1);
}
