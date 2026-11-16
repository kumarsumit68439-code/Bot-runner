// Zero Channel/Role ID Discord bot — Mo Hub modules + Slash Commands
// cp backend/bot-template/index.js backend/bot/index.js
const fs = require("fs");
const path = require("path");
try { require("dotenv").config(); } catch {}
const {
  Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits, Partials,
  EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");

let voiceLib = null;
let playdl = null;
try {
  voiceLib = require("@discordjs/voice");
  try { playdl = require("play-dl"); } catch { playdl = null; }
} catch {
  voiceLib = null;
}

function loadJson(n) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, n), "utf8")); }
  catch (e) { if (e.code !== "ENOENT") console.error(n, e.message); return {}; }
}
function loadCredentials() {
  const f = loadJson("bot-credentials.json");
  const p = (k, e) => String(f[k] || "").trim() || process.env[e] || "";
  return {
    botToken: p("botToken", "DISCORD_TOKEN"),
    clientId: p("clientId", "CLIENT_ID"),
    aiEndpoint: p("aiEndpoint", "AI_ENDPOINT"),
    aiModel: p("aiModel", "AI_MODEL"),
    aiApiKey: p("aiApiKey", "AI_API_KEY"),
    aiChannelId: p("aiChannelId", "AI_CHANNEL_ID"),
  };
}
function loadModules() {
  const d = {
    simple: true, welcome: true, support: false, channelbuilder: false, rolesetup: false,
    tickets: false, antinuke: false, tokenclaim: false, moderation: false, voice: false,
    protect: true, leveling: false, memberadd: true, banbot: false, aichat: true,
    supporter: true, music: false, invitetracker: false,
  };
  try {
    const c = loadJson("bot-config.json");
    if (c && c.modules && typeof c.modules === "object") Object.assign(d, c.modules);
  } catch {}
  return d;
}
function loadOv(gid) {
  try {
    const all = loadJson("channel-overrides.json");
    return (all && all[gid]) || {};
  } catch { return {}; }
}
function saveOv(gid, key, id) {
  try {
    const all = loadJson("channel-overrides.json") || {};
    if (!all[gid]) all[gid] = {};
    all[gid][key] = id;
    fs.writeFileSync(path.join(__dirname, "channel-overrides.json"), JSON.stringify(all, null, 2));
  } catch (e) { console.error("saveOv", e.message); }
}
function redact(s) {
  return String(s || "").replace(/[a-zA-Z0-9_-]{20,}/g, "[redacted]");
}
function nm(a, b) {
  const x = String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return x === y || x.includes(y) || y.includes(x);
}

const creds = loadCredentials();
const modules = loadModules();
if (!creds.botToken) { console.error("No bot token"); process.exit(1); }

const CHANNEL_NAMES = {
  welcome: ["welcome", "welcomes"], support: ["support", "help"], tickets: ["tickets", "ticket"],
  modlogs: ["mod-logs", "modlogs", "logs"], protectlogs: ["protect-logs", "protectlogs", "security-logs"],
  levels: ["levels", "level-up", "xp"], memberadd: ["member-add", "joins", "join-log"],
  aichat: ["ai-chat", "ai", "bot-chat"], music: ["music", "songs"],
  generalvc: ["General VC", "general", "voice"], invites: ["invites", "invite-log"],
};
const ROLE_NAMES = { supporter: ["Supporter", "supporter"], member: ["Member", "member"] };
const guildState = new Map();

const voiceSessions = new Map();

function destroyVoiceSession(gid) {
  const s = voiceSessions.get(gid);
  if (!s) return;
  try { s.player?.stop(true); } catch {}
  try { s.connection?.destroy(); } catch {}
  voiceSessions.delete(gid);
}

async function joinVoiceById(guild, channelId) {
  if (!voiceLib) throw new Error("Install voice libs in bot/: npm install @discordjs/voice play-dl opusscript");
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildVoice) throw new Error("Invalid voice channel ID.");
  const existing = voiceSessions.get(guild.id);
  if (existing && existing.channelId === channelId) return { session: existing, channel: ch, reused: true };
  destroyVoiceSession(guild.id);
  const connection = voiceLib.joinVoiceChannel({
    channelId: ch.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });
  const player = voiceLib.createAudioPlayer();
  connection.subscribe(player);
  const session = { connection, player, channelId: ch.id, textChannelId: null, queue: [], current: null, paused: false };
  player.on("error", (e) => console.error("[voice]", e.message));
  player.on(voiceLib.AudioPlayerStatus.Idle, () => {
    const s = voiceSessions.get(guild.id);
    if (!s || s.player !== player) return;
    s.current = null;
    playNext(guild.id).catch((err) => console.error("[playNext]", err.message));
  });
  connection.on(voiceLib.VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
