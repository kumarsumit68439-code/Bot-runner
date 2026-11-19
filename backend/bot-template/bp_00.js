// Zero Channel/Role ID Discord bot — Mo Hub modules + Slash Commands
// cp backend/bot-template/index.js backend/bot/index.js
const fs = require("fs");
const path = require("path");
try { require("dotenv").config(); } catch {}
const {
  Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits, Partials,
  EmbedBuilder, REST, Routes, SlashCommandBuilder,
} = require("discord.js");

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
  const m = { ...d, ...(loadJson("bot-config.json").modules || {}) };
  if (m.autorole) m.supporter = true;
  if (m.utility || m.fun) m.simple = true;
  if (m.antiraid) m.antinuke = true;
  return m;
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
const nm = (a, b) => String(a || "").toLowerCase().replace(/[\s_-]+/g, "") === String(b || "").toLowerCase().replace(/[\s_-]+/g, "");

async function ensureText(guild, key) {
  const names = CHANNEL_NAMES[key] || [key];
  let ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && names.some((n) => nm(c.name, n)));
  if (ch) return ch;
  try {
    ch = await guild.channels.create({ name: names[0].toLowerCase().replace(/\s+/g, "-"), type: ChannelType.GuildText, reason: "bot auto " + key });
    console.log("[auto] #" + ch.name);
    return ch;
  } catch (e) { console.error(key, e.message); return null; }
}
async function ensureRole(guild, key) {
  const names = ROLE_NAMES[key] || [key];
  let r = guild.roles.cache.find((x) => names.some((n) => nm(x.name, n)));
  if (r) return r;
  try {
    r = await guild.roles.create({ name: names[0], reason: "bot auto" });
    console.log("[auto] @" + r.name);
    return r;
  } catch { return null; }
}
const OV = path.join(__dirname, "channel-overrides.json");
function loadOv(gid) { try { return JSON.parse(fs.readFileSync(OV, "utf8"))[gid] || {}; } catch { return {}; } }
function saveOv(gid, key, id) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(OV, "utf8")); } catch {}
  if (!all[gid]) all[gid] = {};
  all[gid][key] = id;
  fs.writeFileSync(OV, JSON.stringify(all, null, 2));
}
