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
        voiceLib.entersState(connection, voiceLib.VoiceConnectionStatus.Signalling, 5000),
        voiceLib.entersState(connection, voiceLib.VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      destroyVoiceSession(guild.id);
    }
  });
  voiceSessions.set(guild.id, session);
  return { session, channel: ch, reused: false };
}

function miniPlayerRow(disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mp_pause").setLabel("Pause").setStyle(ButtonStyle.Secondary).setDisabled(!!disabled),
    new ButtonBuilder().setCustomId("mp_resume").setLabel("Play").setStyle(ButtonStyle.Success).setDisabled(!!disabled),
    new ButtonBuilder().setCustomId("mp_skip").setLabel("Skip").setStyle(ButtonStyle.Primary).setDisabled(!!disabled),
    new ButtonBuilder().setCustomId("mp_stop").setLabel("Stop").setStyle(ButtonStyle.Danger).setDisabled(!!disabled),
  );
}

function miniPlayerEmbed(track, status) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(status === "paused" ? "Paused" : "Now playing")
    .setDescription(track?.title || track?.url || "Unknown")
    .setFooter({ text: "Music · mini player" });
}

async function playNext(gid) {
  const s = voiceSessions.get(gid);
  if (!s || !playdl) return;
  if (s.paused) return;
  const next = s.queue.shift();
  if (!next) {
    s.current = null;
    return;
  }
  s.current = next;
  const stream = await playdl.stream(next.url);
  const resource = voiceLib.createAudioResource(stream.stream, { inputType: stream.type });
  s.player.play(resource);
  if (s.textChannelId) {
    try {
      const guild = s.connection?.joinConfig ? null : null;
    } catch {}
  }
}

async function enqueueAndPlay(guild, textChannel, query) {
  if (!playdl) throw new Error("play-dl not installed");
  let url = query;
  let title = query;
  if (!/^https?:\/\//i.test(query)) {
    const res = await playdl.search(query, { limit: 1 });
    if (!res?.[0]?.url) throw new Error("No results for: " + query);
    url = res[0].url;
    title = res[0].title || query;
  } else {
    try {
      const info = await playdl.video_basic_info(url);
      title = info?.video_details?.title || title;
    } catch {}
  }
  const s = voiceSessions.get(guild.id);
  if (!s) throw new Error("Bot not in VC. Use /joinvc channel_id:... or /play with channel_id.");
  s.textChannelId = textChannel?.id || s.textChannelId;
  s.queue.push({ url, title });
  if (!s.current && !s.paused) await playNext(guild.id);
  return { title, url, queued: s.queue.length };
}

function getCh(gid, key) {
  const st = guildState.get(gid);
  if (st?.channels?.[key]) return st.channels[key];
  return null;
}
function getRole(gid, key) {
  const st = guildState.get(gid);
  return st?.roles?.[key] || null;
}
function nm(a, b) {
  const x = String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return x === y || x.includes(y) || y.includes(x);
}
function redact(s) {
  return String(s || "").replace(/[a-zA-Z0-9_-]{20,}/g, "[redacted]");
}
function saveOv(gid, key, id) {
  try {
    const all = loadJson("channel-overrides.json") || {};
    if (!all[gid]) all[gid] = {};
    all[gid][key] = id;
    fs.writeFileSync(path.join(__dirname, "channel-overrides.json"), JSON.stringify(all, null, 2));
  } catch (e) { console.error("saveOv", e.message); }
}
function loadOv(gid) {
  try {
    const all = loadJson("channel-overrides.json");
    return (all && all[gid]) || {};
  } catch { return {}; }
}

const ai = {
  url: creds.aiEndpoint || process.env.AI_ENDPOINT || "",
  model: creds.aiModel || process.env.AI_MODEL || "",
  key: creds.aiApiKey || process.env.AI_API_KEY || "",
};
const aiOn = Boolean(modules.aichat && ai.url && ai.model && ai.key);
let aiQ = Promise.resolve();

async function answerAi(message, prompt) {
  const body = {
    model: ai.model,
    messages: [
      { role: "system", content: "You are a helpful Discord server assistant. Be concise." },
      { role: "user", content: prompt },
    ],
    max_tokens: 800,
  };
  const headers = { "Content-Type": "application/json" };
  if (ai.key) headers.Authorization = "Bearer " + ai.key;
  const r = await fetch(ai.url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const text = j.choices?.[0]?.message?.content || j.content || j.error?.message || "No response";
  await message.reply({ content: String(text).slice(0, 1900) }).catch(() => {});
}

async function askAiStructured(system, user) {
  const body = {
    model: ai.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 2000,
  };
  const headers = { "Content-Type": "application/json" };
  if (ai.key) headers.Authorization = "Bearer " + ai.key;
  const r = await fetch(ai.url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  let text = j.choices?.[0]?.message?.content || j.content || "";
  text = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text);
}

async function createChannelsFromPlan(guild, plan) {
  const cats = Array.isArray(plan?.categories) ? plan.categories : [];
  let made = 0;
  for (const c of cats.slice(0, 15)) {
    const name = String(c.name || "Category").trim().slice(0, 100);
    if (!name) continue;
    let cat = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, name));
    if (!cat) {
      try {
        cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "AI setupchannels" });
        made++;
      } catch (e) {
        console.error("cat", name, e.message);
        continue;
      }
    }
    const texts = Array.isArray(c.text) ? c.text : Array.isArray(c.channels) ? c.channels : [];
    for (const tn of texts.slice(0, 30)) {
      const n = String(tn || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 90);
      if (!n) continue;
      if (guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, n))) continue;
      try {
        await guild.channels.create({ name: n, type: ChannelType.GuildText, parent: cat.id, reason: "AI setupchannels" });
        made++;
      } catch (e) {
        console.error("text", n, e.message);
      }
    }
    const voices = Array.isArray(c.voice) ? c.voice : [];
    for (const vn of voices.slice(0, 20)) {
      const n = String(vn || "").trim().slice(0, 100);
      if (!n) continue;
      if (guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, n))) continue;
      try {
        await guild.channels.create({ name: n, type: ChannelType.GuildVoice, parent: cat.id, reason: "AI setupchannels" });
        made++;
      } catch (e) {
        console.error("voice", n, e.message);
      }
    }
  }
  return made;
}

async function createRolesFromPlan(guild, plan) {
  const roles = Array.isArray(plan?.roles) ? plan.roles : [];
  let made = 0;
  for (const r of roles.slice(0, 40)) {
    const name = String(r.name || "").trim().slice(0, 100);
    if (!name) continue;
    if (guild.roles.cache.find((x) => nm(x.name, name))) continue;
    const opts = { name, reason: "AI setuproles" };
    if (typeof r.color === "number" && r.color >= 0 && r.color <= 0xffffff) opts.color = r.color;
    else if (typeof r.color === "string" && /^#?[0-9a-fA-F]{6}$/.test(r.color)) {
      opts.color = parseInt(r.color.replace("#", ""), 16);
    }
    if (typeof r.hoist === "boolean") opts.hoist = r.hoist;
    if (typeof r.mentionable === "boolean") opts.mentionable = r.mentionable;
    try {
      await guild.roles.create(opts);
      made++;
    } catch (e) {
      console.error("role", name, e.message);
    }
  }
  return made;
}

const CHANNEL_AI_SYSTEM = `You design Discord server channel layouts. Reply with ONLY valid JSON (no markdown):
