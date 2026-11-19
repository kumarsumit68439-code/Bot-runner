"use strict";
/**
 * Bot panel daemon: runs ONE Discord bot from ./bot with child_process.spawn
 * and exposes it to the Next.js panel over an authenticated WebSocket.
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");

try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {}

const PORT = Number(process.env.PORT) || 8080;
const HOST =
  process.env.HOST ||
  (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ? "0.0.0.0" : "127.0.0.1");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const BOT_DIR = path.resolve(process.env.BOT_DIR || path.join(__dirname, "bot"));
const RAM_LIMIT_MB = Number(process.env.RAM_LIMIT_MB) || Math.round(os.totalmem() / 1048576);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
const ALLOWED_BINARIES = new Set((process.env.ALLOWED_BINARIES || "node,python3,python,npm,npx,bun").split(",").map((s) => s.trim()));

if (!AUTH_TOKEN || AUTH_TOKEN.length < 16) {
  console.error("FATAL: set AUTH_TOKEN (at least 16 characters) in .env or the environment.");
  process.exit(1);
}

fs.mkdirSync(BOT_DIR, { recursive: true });

const SETTINGS_FILE = path.join(__dirname, "settings.json");
function loadSettings() {
  try { return { ...{ startupCommand: "node index.js", autoRestart: true }, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) }; }
  catch { return { startupCommand: "node index.js", autoRestart: true }; }
}
function saveSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}
let settings = loadSettings();

const exists = (f) => fs.existsSync(path.join(BOT_DIR, f));

function tokenize(cmd) {
  const out = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") q = c;
    else if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function commandError(cmd) {
  const parts = tokenize(cmd || "");
  if (!parts.length) return "Empty startup command";
  const bin = parts[0];
  if (bin.includes("/") || bin.includes("\\")) return "Binary path not allowed";
  if (!ALLOWED_BINARIES.has(bin)) return `Binary not allowed: ${bin}`;
  return null;
}

const clients = new Set();
let status = "offline";
let lastStats = { cpu: 0, ram: 0, ramLimit: RAM_LIMIT_MB, uptime: 0 };
const history = [];
const HISTORY_LIMIT = 500;

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === 1) try { c.send(data); } catch {}
  }
}
function pushConsole(text) {
  history.push(text);
  if (history.length > HISTORY_LIMIT) history.shift();
  broadcast({ type: "console", data: text });
}
const panelLog = (t) => pushConsole(`\x1b[36m[panel]\x1b[0m ${t}\r\n`);
const setStatus = (s) => { status = s; broadcast({ type: "status", state: s }); };
const setStats = (s) => { lastStats = s; broadcast({ type: "stats", ...s }); };

let child = null;
let startedAt = 0;
let stopRequested = false;
let restartRequested = false;
let restartTimer = null;
let graceTimer = null;
let killTimer = null;
const crashTimes = [];

function killGroup(sig) {
  if (!child) return;
  try { process.kill(-child.pid, sig); }
  catch { try { child.kill(sig); } catch {} }
}

function startBot() {
  if (child) return panelLog("Bot is already running.");
  clearTimeout(restartTimer);
  restartTimer = null;
  const err = commandError(settings.startupCommand);
  if (err) return panelLog(`\x1b[31m${err}\x1b[0m`);

  const [bin, ...args] = tokenize(settings.startupCommand);
  const env = { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" };
  delete env.AUTH_TOKEN;
  try {
    const envPath = path.join(BOT_DIR, ".env");
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[m[1]] = v;
      }
    }
  } catch {}
  if (env.BOT_TOKEN && !env.DISCORD_TOKEN) env.DISCORD_TOKEN = env.BOT_TOKEN;
  if (env.DISCORD_TOKEN && !env.BOT_TOKEN) env.BOT_TOKEN = env.DISCORD_TOKEN;

  stopRequested = false;
  setStatus("starting");
  panelLog(`Running: ${settings.startupCommand}`);

  const proc = spawn(bin, args, { cwd: BOT_DIR, env, stdio: ["pipe", "pipe", "pipe"], detached: true });
  child = proc;
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (d) => pushConsole(d));
  proc.stderr.on("data", (d) => pushConsole(`\x1b[31m${d}\x1b[0m`));
  proc.stdin.on("error", () => {});

  proc.once("spawn", () => {
    startedAt = Date.now();
    graceTimer = setTimeout(() => {
      if (child === proc && status === "starting") setStatus("online");
    }, 2000);
  });
  proc.once("error", (e) => {
    panelLog(`\x1b[31mFailed to start: ${e.message}\x1b[0m`);
    onEnd(proc, 1, null);
  });
  proc.once("exit", (code, signal) => onEnd(proc, code, signal));
}

function onEnd(proc, code, signal) {
  if (proc.ended) return;
  proc.ended = true;
  clearTimeout(graceTimer);
  clearTimeout(killTimer);
  if (child === proc) child = null;
  panelLog(`Process exited (${signal ? "signal " + signal : "code " + code}).`);
  setStatus("offline");
  setStats({ cpu: 0, ram: 0, ramLimit: RAM_LIMIT_MB, uptime: 0 });

  const manual = stopRequested;
  stopRequested = false;
  if (restartRequested) {
    restartRequested = false;
    setTimeout(startBot, 500);
    return;
  }
  const crashed = signal !== null || code !== 0;
  if (!manual && crashed && settings.autoRestart) {
    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift();
    if (crashTimes.length > 5) return panelLog("Crashed more than 5 times in 60s. Auto-restart paused; press Start to try again.");
    panelLog("Auto-restarting in 5s...");
    restartTimer = setTimeout(startBot, 5000);
  }
}

function requestStop() {
  if (!child || stopRequested) return;
  stopRequested = true;
  panelLog("Stopping (SIGTERM)...");
  const p = child;
  killGroup("SIGTERM");
  killTimer = setTimeout(() => {
    if (child === p) { panelLog("Did not exit within 10s, sending SIGKILL."); killGroup("SIGKILL"); }
  }, 10000);
}
function stopBot() {
  restartRequested = false;
  if (!child && restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
    panelLog("Cancelled pending restart.");
    return;
  }
  requestStop();
}
function restartBot() {
  restartRequested = true;
  if (child) requestStop();
  else {
    restartRequested = false;
    startBot();
  }
}

setInterval(() => {
  if (!child || !startedAt) return;
  try {
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    let ram = 0;
    try {
      const st = fs.readFileSync(`/proc/${child.pid}/status`, "utf8");
      const m = st.match(/VmRSS:\s+(\d+)/);
      if (m) ram = Math.round(Number(m[1]) / 1024);
    } catch {}
    setStats({ cpu: 0, ram, ramLimit: RAM_LIMIT_MB, uptime });
  } catch {}
}, 3000);

function authOk(url, req) {
  try {
    const u = new URL(url, "http://localhost");
    const token = u.searchParams.get("token") || "";
    if (token !== AUTH_TOKEN) return false;
    if (!ALLOWED_ORIGINS.length) return true;
    const origin = (req.headers.origin || "").replace(/\/$/, "");
    if (!origin) return true;
    return ALLOWED_ORIGINS.includes(origin);
  } catch { return false; }
}

async function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const id = msg.id;
  const reply = (obj) => { try { ws.send(JSON.stringify({ ...obj, id })); } catch {} };
  try {
    if (msg.type === "power:start") { startBot(); reply({ type: "ok" }); }
    else if (msg.type === "power:stop") { stopBot(); reply({ type: "ok" }); }
    else if (msg.type === "power:restart") { restartBot(); reply({ type: "ok" }); }
    else if (msg.type === "console:input") {
      if (child && child.stdin.writable) child.stdin.write(String(msg.data || "") + "\n");
      reply({ type: "ok" });
    }
    else if (msg.type === "files:list") {
      const out = [];
      for (const e of await fsp.readdir(BOT_DIR, { withFileTypes: true })) {
        if (!e.isFile()) continue;
        out.push({ name: e.name, size: (await fsp.stat(path.join(BOT_DIR, e.name))).size });
      }
      reply({ type: "files:list", files: out });
    }
    else if (msg.type === "files:read") {
      const name = path.basename(String(msg.name || ""));
      const p = path.join(BOT_DIR, name);
      if (path.dirname(p) !== BOT_DIR) throw new Error("Invalid file name");
      const content = await fsp.readFile(p, "utf8");
      reply({ type: "files:content", name, content });
    }
    else if (msg.type === "files:write") {
      const name = path.basename(String(msg.name || ""));
      const p = path.join(BOT_DIR, name);
      if (path.dirname(p) !== BOT_DIR) throw new Error("Invalid file name");
      await fsp.writeFile(p, String(msg.content ?? ""), "utf8");
      reply({ type: "files:saved", name });
    }
    else if (msg.type === "files:delete") {
      const name = path.basename(String(msg.name || ""));
      const p = path.join(BOT_DIR, name);
      if (path.dirname(p) !== BOT_DIR) throw new Error("Invalid file name");
      await fsp.unlink(p);
      reply({ type: "files:deleted", name });
    }
    else if (msg.type === "startup:get") {
      reply({ type: "startup:settings", settings });
    }
    else if (msg.type === "startup:set") {
      const next = { ...settings, ...msg.settings };
      const err = commandError(next.startupCommand);
      if (err) throw new Error(err);
      settings = next;
      saveSettings(settings);
      reply({ type: "startup:settings", settings });
    }
    else if (msg.type === "ping") reply({ type: "pong" });
  } catch (e) {
    reply({ type: "error", message: e.message || String(e) });
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot panel daemon\n");
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  if (!authOk(req.url || "/", req)) {
    ws.close(4001, "unauthorized");
    return;
  }
  clients.add(ws);
  try {
    ws.send(JSON.stringify({ type: "status", state: status }));
    ws.send(JSON.stringify({ type: "stats", ...lastStats }));
    for (const line of history) ws.send(JSON.stringify({ type: "console", data: line }));
  } catch {}
  ws.on("message", (raw) => handleMessage(ws, raw.toString()));
  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, HOST, () => {
  console.log(`Panel daemon listening on ${HOST}:${PORT}, bot dir: ${BOT_DIR}`);
  if (process.env.AUTO_START === "true") startBot();
});
