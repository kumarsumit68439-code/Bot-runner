"use strict";
/**
 * Bot panel daemon: runs ONE Discord bot from ./bot with child_process.spawn
 * and exposes it to the Next.js panel over an authenticated WebSocket.
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const express = require("express");
const { WebSocketServer } = require("ws");

const log = (...a) => console.log(new Date().toISOString(), ...a);

process.on("uncaughtException", (e) => log("[fatal] uncaughtException:", (e && e.stack) || e));
process.on("unhandledRejection", (e) => log("[fatal] unhandledRejection:", (e && e.stack) || e));

try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {}

const PORT = Number(process.env.PORT) || 8080;
// Termux/Cloudflare: HOST=127.0.0.1 (default). Railway/public VPS: HOST=0.0.0.0
const HOST =
  process.env.HOST ||
  (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ? "0.0.0.0" : "127.0.0.1");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const BOT_DIR = path.resolve(process.env.BOT_DIR || path.join(__dirname, "bot"));
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const RAM_LIMIT_MB = Number(process.env.RAM_LIMIT_MB) || Math.round(os.totalmem() / 1048576);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
const ALLOWED_BINARIES = new Set((process.env.ALLOWED_BINARIES || "node,python3,python,npm,npx,bun").split(",").map((s) => s.trim()));
const MAX_FILE_BYTES = 1024 * 1024;
const HISTORY_LIMIT = 1000;
const CLK_TCK = 100;

if (AUTH_TOKEN.length < 16) {
  console.error("FATAL: set AUTH_TOKEN (at least 16 characters) in .env or the environment.");
  process.exit(1);
}
fs.mkdirSync(BOT_DIR, { recursive: true });

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
function commandError(cmd) {
  if (typeof cmd !== "string" || !cmd.trim() || cmd.length > 300 || /[\x00-\x1f]/.test(cmd)) return "Invalid startup command";
  const [bin] = tokenize(cmd);
  if (!ALLOWED_BINARIES.has(bin)) return `"${bin}" is not allowed. Allowed: ${[...ALLOWED_BINARIES].join(", ")}`;
  return null;
}
const exists = (f) => fs.existsSync(path.join(BOT_DIR, f));
let settings = {
  startupCommand: exists("index.js") ? "node index.js" : exists("bot.py") ? "python3 bot.py" : "node index.js",
  nodeVersion: "20",
  autoRestart: true,
  storageLimit: "512 GB",
  ramAllocation: "512 MB",
  cpuCores: "1 vCPU",
  gpuAccel: "None (CPU Only)",
};
try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) }; } catch {}

async function atomicWrite(file, data, mode) {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    await fsp.writeFile(tmp, data);
    if (mode !== undefined) await fsp.chmod(tmp, mode);
    await fsp.rename(tmp, file);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

const clients = new Set();
const history = [];
let status = "offline";
let lastStats = { cpu: 0, ram: 0, ramLimit: RAM_LIMIT_MB, uptime: 0 };

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === 1) ws.send(s);
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
    return panelLog("Pending auto-restart cancelled.");
  }
  requestStop();
}
function restartBot() {
  if (!child) return startBot();
  restartRequested = true;
  requestStop();
}
function power(action) {
  if (action === "start") startBot();
  else if (action === "stop") stopBot();
  else if (action === "restart") restartBot();
}

function readStat(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return { ppid: +rest[1], ticks: +rest[11] + +rest[12] };
  } catch { return null; }
}
let treeCache = { root: 0, pids: [], at: 0 };
function findTree(rootPid) {
  const parents = new Map();
  for (const n of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(n)) continue;
    const r = readStat(n);
    if (r) parents.set(+n, r.ppid);
  }
  const tree = new Set([rootPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, ppid] of parents) if (!tree.has(pid) && tree.has(ppid)) { tree.add(pid); grew = true; }
  }
  return [...tree];
}
function sampleTree(rootPid) {
  if (treeCache.root !== rootPid || Date.now() - treeCache.at > 10000) {
    treeCache = { root: rootPid, pids: findTree(rootPid), at: Date.now() };
  }
  let ticks = 0, rssKb = 0;
  for (const pid of treeCache.pids) {
    const r = readStat(pid);
    if (!r) continue;
    ticks += r.ticks;
    try {
      const m = fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/);
      if (m) rssKb += +m[1];
    } catch {}
  }
  return { ticks, rssMb: rssKb / 1024 };
}
let lastSample = null;
setInterval(() => {
  if (!child || !child.pid) { lastSample = null; return; }
  try {
    const now = Date.now();
    const s = sampleTree(child.pid);
    let cpu = 0;
    if (lastSample && lastSample.pid === child.pid) {
      const dt = (now - lastSample.t) / 1000;
      cpu = Math.max(0, ((s.ticks - lastSample.ticks) / CLK_TCK / dt) * 100);
    }
    lastSample = { pid: child.pid, t: now, ticks: s.ticks };
    setStats({
      cpu: Math.round(cpu * 10) / 10,
      ram: Math.round(s.rssMb),
      ramLimit: RAM_LIMIT_MB,
      uptime: Math.floor((now - startedAt) / 1000),
    });
  } catch {}
}, 2000);

const SAFE_NAME = /^[A-Za-z0-9_.\-]{1,100}$/;
function safePath(name) {
  if (typeof name !== "string" || !SAFE_NAME.test(name) || /^\.+$/.test(name)) throw new Error("Invalid file name");
  const p = path.join(BOT_DIR, name);
  if (path.dirname(p) !== BOT_DIR) throw new Error("Invalid file name");
  return p;
}
async function listFiles() {
  const out = [];
  for (const e of await fsp.readdir(BOT_DIR, { withFileTypes: true })) {
    if (!e.isFile() || !SAFE_NAME.test(e.name)) continue;
    out.push({ name: e.name, size: (await fsp.stat(path.join(BOT_DIR, e.name))).size });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
async function readFile(name) {
  const p = safePath(name);
  const st = await fsp.lstat(p);
  if (!st.isFile()) throw new Error("Not a regular file");
  if (st.size > MAX_FILE_BYTES) throw new Error("File is larger than 1 MB");
  const buf = await fsp.readFile(p);
  if (buf.includes(0)) throw new Error("Binary files cannot be edited");
  return buf.toString("utf8");
}
async function writeFile(name, content) {
  const p = safePath(name);
  if (typeof content !== "string" || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error("Content missing or larger than 1 MB");
  let mode;
  try {
    const st = await fsp.lstat(p);
    if (!st.isFile()) throw new Error("Refusing to overwrite a non-regular file");
    mode = st.mode & 0o777;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await atomicWrite(p, content, mode);
}

const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const errText = (e) => (e && e.message) || String(e);

async function handle(ws, msg) {
  switch (msg.type) {
    case "hello":
      if (history.length) send(ws, { type: "console", data: history.join("") });
      break;
    case "ping":
      send(ws, { type: "pong" });
      break;
    case "power": power(msg.action); break;
    case "start": case "stop": case "restart": power(msg.type); break;
    case "command": case "send_command": {
      const line = String(msg.data ?? msg.command ?? "").replace(/[\r\n]+/g, " ");
      if (!line || line.length > 2000) break;
      if (!child || !child.stdin.writable || stopRequested) {
        send(ws, { type: "console", data: "\x1b[33m[panel]\x1b[0m Bot is not running.\r\n" });
        break;
      }
      pushConsole(`\x1b[90m> ${line}\x1b[0m\r\n`);
      child.stdin.write(line + "\n");
      break;
    }
    case "files:list": case "get_files":
      try { send(ws, { type: "files:list", files: await listFiles() }); }
      catch (e) { send(ws, { type: "files:list", files: [], error: errText(e) }); }
      break;
    case "files:read": case "get_file":
      try { send(ws, { type: "files:content", name: msg.name, content: await readFile(msg.name) }); }
      catch (e) { send(ws, { type: "files:content", name: msg.name, error: errText(e) }); }
      break;
    case "files:write": case "save_file": {
      const name = msg.name ?? msg.path ?? msg.file;
      try { await writeFile(name, msg.content); send(ws, { type: "files:saved", name }); }
      catch (e) { send(ws, { type: "files:saved", name, error: errText(e) }); }
      break;
    }
    case "startup:get":
      send(ws, { type: "startup:settings", settings });
      break;
    case "startup:set": {
      const s = msg.settings || {};
      const next = { ...settings };
      if (s.startupCommand !== undefined) {
        const err = commandError(s.startupCommand);
        if (err) return send(ws, { type: "startup:saved", error: err });
        next.startupCommand = s.startupCommand.trim();
      }
      if (typeof s.autoRestart === "boolean") next.autoRestart = s.autoRestart;
      if (typeof s.nodeVersion === "string" && s.nodeVersion.length <= 10) next.nodeVersion = s.nodeVersion;
      const allowStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
      if (allowStr(s.storageLimit, 32)) next.storageLimit = s.storageLimit;
      if (allowStr(s.ramAllocation, 32)) next.ramAllocation = s.ramAllocation;
      if (allowStr(s.cpuCores, 32)) next.cpuCores = s.cpuCores;
      if (allowStr(s.gpuAccel, 64)) next.gpuAccel = s.gpuAccel;
      try {
        await atomicWrite(SETTINGS_FILE, JSON.stringify(next, null, 2));
        settings = next;
        send(ws, { type: "startup:saved", settings });
      } catch (e) {
        send(ws, { type: "startup:saved", error: errText(e) });
      }
      break;
    }
    default:
      send(ws, { type: "error", message: `Unknown message type: ${String(msg.type)}` });
  }
}

const app = express();
app.disable("x-powered-by");
app.get("/health", (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ error: "Not found" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

const tokenHash = crypto.createHash("sha256").update(AUTH_TOKEN).digest();
function tokenOk(t) {
  if (typeof t !== "string") return false;
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(t).digest(), tokenHash);
}
const clientIp = (req) => String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress);
const fails = new Map();
const WINDOW = 10 * 60 * 1000;
function recentFails(ip) {
  const now = Date.now();
  const list = (fails.get(ip) || []).filter((t) => now - t < WINDOW);
  list.length ? fails.set(ip, list) : fails.delete(ip);
  return list;
}

server.on("upgrade", (req, socket, head) => {
  const ip = clientIp(req);
  const refuse = (code, reason, detail) => {
    log(`[ws] refused ${ip}: ${reason}${detail ? " (" + detail + ")" : ""}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => {});
      ws.close(code, reason);
    });
  };
  if (recentFails(ip).length >= 5) return refuse(4029, "Too many failed attempts");
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(String(req.headers.origin || "").replace(/\/$/, ""))) {
    return refuse(4003, "Origin not allowed", `origin=${req.headers.origin}`);
  }
  let token;
  try { token = new URL(req.url, "http://localhost").searchParams.get("token"); } catch {}
  if (!tokenOk(token)) {
    fails.set(ip, [...recentFails(ip), Date.now()]);
    return refuse(4001, "Unauthorized", "wrong or missing token");
  }
  fails.delete(ip);
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws, req) => {
  const ip = clientIp(req);
  clients.add(ws);
  ws.isAlive = true;
  log(`[ws] connected ${ip} (${clients.size} client(s))`);
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", () => { ws.isAlive = true; });
  ws.on("close", (code) => { clients.delete(ws); log(`[ws] closed ${ip} code=${code} (${clients.size} client(s))`); });
  ws.on("error", (e) => { clients.delete(ws); log(`[ws] error ${ip}: ${errText(e)}`); });
  send(ws, { type: "status", state: status });
  send(ws, { type: "stats", ...lastStats });
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: "error", message: "Invalid JSON" }); }
    if (!msg || typeof msg.type !== "string") return send(ws, { type: "error", message: "Missing message type" });
    handle(ws, msg).catch((e) => send(ws, { type: "error", message: errText(e) }));
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { log("[ws] terminating unresponsive client"); ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

function shutdown() {
  const p = child;
  if (!p) return process.exit(0);
  stopRequested = true;
  restartRequested = false;
  killGroup("SIGTERM");
  p.once("exit", () => process.exit(0));
  setTimeout(() => { killGroup("SIGKILL"); process.exit(0); }, 5000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
  log(`Panel daemon listening on ${HOST}:${PORT}, bot dir: ${BOT_DIR}`);
  if (process.env.AUTO_START === "true") startBot();
});
