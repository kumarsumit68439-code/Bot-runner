// Zero Channel/Role ID Discord bot — Mo Hub modules. cp to backend/bot/index.js
const fs = require("fs");
const path = require("path");
try { require("dotenv").config(); } catch {}
const { Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits, Partials, EmbedBuilder } = require("discord.js");

function loadJson(n) { try { return JSON.parse(fs.readFileSync(path.join(__dirname, n), "utf8")); } catch (e) { if (e.code !== "ENOENT") console.error(n, e.message); return {}; } }
function loadCredentials() {
  const f = loadJson("bot-credentials.json");
  const p = (k, e) => String(f[k] || "").trim() || process.env[e] || "";
  return { botToken: p("botToken", "DISCORD_TOKEN"), clientId: p("clientId", "CLIENT_ID"), aiEndpoint: p("aiEndpoint", "AI_ENDPOINT"), aiModel: p("aiModel", "AI_MODEL"), aiApiKey: p("aiApiKey", "AI_API_KEY"), aiChannelId: p("aiChannelId", "AI_CHANNEL_ID") };
}
function loadModules() {
  const d = { simple: true, welcome: true, support: false, channelbuilder: false, rolesetup: false, tickets: false, antinuke: false, tokenclaim: false, moderation: false, voice: false, protect: true, leveling: false, memberadd: true, banbot: false, aichat: true, supporter: true, music: false, invitetracker: false };
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
  aichat: ["ai-chat", "ai", "bot-chat"], music: ["music", "songs"], generalvc: ["General VC", "general", "voice"],
  invites: ["invites", "invite-log"],
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
    console.log("[auto] #" + ch.name); return ch;
  } catch (e) { console.error(key, e.message); return null; }
}
async function ensureRole(guild, key) {
  const names = ROLE_NAMES[key] || [key];
  let r = guild.roles.cache.find((x) => names.some((n) => nm(x.name, n)));
  if (r) return r;
  try { r = await guild.roles.create({ name: names[0], reason: "bot auto" }); console.log("[auto] @" + r.name); return r; }
  catch (e) { return null; }
}
const OV = path.join(__dirname, "channel-overrides.json");
function loadOv(gid) { try { return JSON.parse(fs.readFileSync(OV, "utf8"))[gid] || {}; } catch { return {}; } }
function saveOv(gid, key, id) {
  let all = {}; try { all = JSON.parse(fs.readFileSync(OV, "utf8")); } catch {}
  if (!all[gid]) all[gid] = {}; all[gid][key] = id; fs.writeFileSync(OV, JSON.stringify(all, null, 2));
  const s = guildState.get(gid); if (s) s.overrides[key] = id;
}
async function resolveGuild(guild) {
  const st = { channels: {}, roles: {}, overrides: loadOv(guild.id), invites: new Map() };
  for (const key of Object.keys(CHANNEL_NAMES)) {
    if (st.overrides[key]) { const ch = guild.channels.cache.get(st.overrides[key]); if (ch) { st.channels[key] = ch; continue; } }
    st.channels[key] = await ensureText(guild, key);
  }
  st.roles.supporter = await ensureRole(guild, "supporter");
  guildState.set(guild.id, st);
  if (modules.invitetracker) { try { (await guild.invites.fetch()).forEach((i) => st.invites.set(i.code, i.uses || 0)); } catch {} }
  return st;
}
function getCh(gid, k) { return guildState.get(gid)?.channels?.[k] || null; }
function getRole(gid, k) { return guildState.get(gid)?.roles?.[k] || null; }

function chatUrl(ep) { const b = String(ep || "").trim().replace(/\/+$/, ""); return !b ? "" : (/\/chat\/completions$/.test(b) ? b : b + "/chat/completions"); }
const ai = { url: chatUrl(creds.aiEndpoint), model: creds.aiModel, key: creds.aiApiKey };
const aiOn = Boolean(modules.aichat && ai.url && ai.model && ai.key);
const histMap = new Map(); let aiQ = Promise.resolve();
const redact = (t) => (ai.key ? String(t).split(ai.key).join("***") : String(t));
async function askAi(hist) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(ai.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + ai.key }, body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: "Friendly Discord assistant. Under 1500 chars." }, ...hist] }), signal: ctrl.signal });
    const raw = await res.text(); let data = null; try { data = JSON.parse(raw); } catch {}
    if (!res.ok) throw new Error("HTTP " + res.status);
    return String(data?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } finally { clearTimeout(timer); }
}
function chunk(text, size = 1900) { const out = []; let r = text; while (r.length > size) { let c = r.lastIndexOf("\n", size); if (c < size * 0.5) c = size; out.push(r.slice(0, c)); r = r.slice(c).replace(/^\n/, ""); } if (r) out.push(r); return out; }
const NO_PINGS = { parse: [], repliedUser: false };
async function answerAi(msg, line) {
  const cid = msg.channelId; if (!histMap.has(cid)) histMap.set(cid, []);
  const hist = histMap.get(cid); hist.push({ role: "user", content: line }); while (hist.length > 12) hist.shift();
  const typing = setInterval(() => { try { msg.channel.sendTyping().catch(() => {}); } catch {} }, 8000);
  try {
    const reply = await askAi(hist); const text = reply || "Empty."; if (reply) hist.push({ role: "assistant", content: reply });
    const parts = chunk(text); await msg.reply({ content: parts[0], allowedMentions: NO_PINGS });
    for (const p of parts.slice(1)) await msg.channel.send({ content: p, allowedMentions: NO_PINGS });
  } catch (e) { hist.pop(); await msg.reply({ content: "AI error: " + redact(e.message).slice(0, 300), allowedMentions: NO_PINGS }).catch(() => {}); }
  finally { clearInterval(typing); }
}

const LF = path.join(__dirname, "levels-data.json");
let levels = {}; try { levels = JSON.parse(fs.readFileSync(LF, "utf8")); } catch {}
function saveLevels() { try { fs.writeFileSync(LF, JSON.stringify(levels)); } catch {} }
function addXp(gid, uid, amt) {
  if (!levels[gid]) levels[gid] = {}; if (!levels[gid][uid]) levels[gid][uid] = { xp: 0, level: 0 };
  const u = levels[gid][uid]; u.xp += amt; const need = (u.level + 1) * 100;
  if (u.xp >= need) { u.xp -= need; u.level++; saveLevels(); return u.level; } saveLevels(); return null;
}
const joinBuckets = new Map(); const spamMap = new Map(); const nukeBuckets = new Map();

function createClient(withMsg) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites];
  if (withMsg) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions);
  const c = new Client({ intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction] });

  c.once(Events.ClientReady, async () => {
    console.log("Logged in as " + c.user.tag);
    console.log("Modules ON:", Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ") || "(none)");
    for (const [, g] of c.guilds.cache) { try { await resolveGuild(g); } catch (e) { console.error(e.message); } }
    console.log(aiOn ? "AI ON " + ai.model : "AI OFF");
  });
  c.on(Events.GuildCreate, async (g) => { try { await resolveGuild(g); } catch (e) {} });

  c.on(Events.GuildMemberAdd, async (member) => {
    const gid = member.guild.id; if (!guildState.has(gid)) await resolveGuild(member.guild);
    const st = guildState.get(gid);
    if (modules.antinuke || modules.protect) {
      const now = Date.now(); let b = (joinBuckets.get(gid) || []).filter((t) => now - t < 10000); b.push(now); joinBuckets.set(gid, b);
      if (b.length >= 8) { const ch = getCh(gid, "protectlogs") || getCh(gid, "modlogs"); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Anti-Raid").setDescription("≥8 joins/10s: " + member.user.tag)] }).catch(() => {}); }
    }
    if (modules.welcome) { const ch = getCh(gid, "welcome"); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("Welcome!").setDescription("Hey " + member + ", welcome to **" + member.guild.name + "**!").setThumbnail(member.user.displayAvatarURL())] }).catch(() => {}); }
    let inviter = "unknown";
    if (modules.invitetracker && st) {
      try {
        const invs = await member.guild.invites.fetch();
        for (const [code, inv] of invs) { const prev = st.invites.get(code) || 0; if ((inv.uses || 0) > prev) { inviter = inv.inviter?.tag || "vanity"; break; } }
        st.invites.clear(); invs.forEach((i) => st.invites.set(i.code, i.uses || 0));
      } catch {}
    }
    if (modules.memberadd || modules.invitetracker) {
      const ch = getCh(gid, "memberadd") || getCh(gid, "invites");
      const age = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
      if (ch) ch.send("📥 **" + member.user.tag + "** joined (age " + age + "d)" + (modules.invitetracker ? " via **" + inviter + "**" : "")).catch(() => {});
    }
    if (modules.supporter) { const role = getRole(gid, "supporter"); if (role) member.roles.add(role).catch(() => {}); }
  });

  if (modules.antinuke) {
    c.on(Events.ChannelDelete, async (channel) => {
      if (!channel.guild) return; const gid = channel.guild.id; const now = Date.now();
      let b = (nukeBuckets.get(gid) || []).filter((t) => now - t < 15000); b.push(now); nukeBuckets.set(gid, b);
      if (b.length >= 3) { const ch = getCh(gid, "modlogs") || getCh(gid, "protectlogs"); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Anti-Nuke").setDescription("Multiple channel deletes incl. #" + channel.name)] }).catch(() => {}); }
    });
  }

  if (withMsg) {
    c.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !message.guild) return;
      const gid = message.guild.id; if (!guildState.has(gid)) await resolveGuild(message.guild);
      const content = String(message.cleanContent || "").trim();
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      const isMod = isAdmin || message.member?.permissions?.has(PermissionFlagsBits.ModerateMembers) || message.member?.permissions?.has(PermissionFlagsBits.KickMembers);

      if (modules.protect && content) {
        const invite = /(discord\.gg|discord\.com\/invite)\//i.test(content);
        const many = message.mentions.users.size + message.mentions.roles.size >= 5;
        const key = message.author.id; const now = Date.now(); let s = spamMap.get(key) || { count: 0, last: 0 };
        if (now - s.last < 4000) s.count++; else s.count = 1; s.last = now; spamMap.set(key, s);
        if (invite || many || s.count >= 6) {
          try { await message.delete(); } catch {}
          const logCh = getCh(gid, "protectlogs") || getCh(gid, "modlogs");
          if (logCh) logCh.send("🛡️ Deleted **" + message.author.tag + "**").catch(() => {});
          return;
        }
      }
      if (modules.leveling && content.length > 2) {
        const nl = addXp(gid, message.author.id, 10 + Math.min(20, content.length / 10));
        if (nl !== null) { const ch = getCh(gid, "levels") || message.channel; ch.send("🎉 " + message.author + " level **" + nl + "*!").catch(() => {}); }
      }
      if (aiOn) {
        const aiCh = getCh(gid, "aichat");
        if (((aiCh && message.channelId === aiCh.id) || (creds.aiChannelId && message.channelId === creds.aiChannelId)) && content) {
          const name = message.member?.displayName || message.author.username;
          aiQ = aiQ.then(() => answerAi(message, name + ": " + content.slice(0, 1500))).catch(() => {});
          return;
        }
      }
      if (!content.startsWith("!")) return;
      const parts = content.slice(1).split(/\s+/); const cmd = (parts[0] || "").toLowerCase(); const args = parts.slice(1);

      if (cmd === "set" && message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
        const mod = (args[0] || "").toLowerCase().replace(/[^a-z]/g, "");
        const alias = { ai: "aichat", logs: "modlogs", protect: "protectlogs", level: "levels", join: "memberadd", ticket: "tickets", vc: "generalvc", invite: "invites" };
        const key = alias[mod] || mod;
        if (!CHANNEL_NAMES[key]) return message.reply("Unknown. " + Object.keys(CHANNEL_NAMES).join(", ")).catch(() => {});
        saveOv(gid, key, message.channel.id); const st = guildState.get(gid); if (st) st.channels[key] = message.channel;
        return message.reply("✅ Bound **" + key + "** → " + message.channel).catch(() => {});
      }

      if (modules.simple) {
        if (cmd === "ping") return message.reply("Pong! " + c.ws.ping + "ms").catch(() => {});
        if (cmd === "help") return message.reply("`!ping !serverinfo !userinfo !avatar !rank !ticket !close !warn !kick !ban !timeout !purge !setupchannels !setuproles !modules !set`").catch(() => {});
        if (cmd === "serverinfo") return message.reply({ embeds: [new EmbedBuilder().setTitle(message.guild.name).addFields({ name: "Members", value: String(message.guild.memberCount), inline: true }, { name: "Channels", value: String(message.guild.channels.cache.size), inline: true })] }).catch(() => {});
        if (cmd === "userinfo") { const u = message.mentions.users.first() || message.author; return message.reply({ embeds: [new EmbedBuilder().setTitle(u.tag).setThumbnail(u.displayAvatarURL()).addFields({ name: "ID", value: u.id })] }).catch(() => {}); }
        if (cmd === "avatar") { const u = message.mentions.users.first() || message.author; return message.reply(u.displayAvatarURL({ size: 512 })).catch(() => {}); }
        if (cmd === "modules") return message.reply("ON: " + Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ")).catch(() => {});
      }

      if (modules.channelbuilder && cmd === "setupchannels" && isAdmin) {
        for (const name of ["INFO", "GENERAL", "VOICE", "STAFF"]) {
          let cat = message.guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, name));
          if (!cat) try { cat = await message.guild.channels.create({ name, type: ChannelType.GuildCategory }); } catch {}
          if (name === "GENERAL" && cat) for (const tn of ["chat", "media", "bots"]) { if (!message.guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, tn))) try { await message.guild.channels.create({ name: tn, type: ChannelType.GuildText, parent: cat.id }); } catch {} }
          if (name === "VOICE" && cat) for (const vn of ["General VC", "Music", "AFK"]) { if (!message.guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, vn))) try { await message.guild.channels.create({ name: vn, type: ChannelType.GuildVoice, parent: cat.id }); } catch {} }
        }
        return message.reply("✅ Channels/VC created.").catch(() => {});
      }
      if (modules.rolesetup && cmd === "setuproles" && isAdmin) {
        for (const rn of ["Owner", "Admin", "Moderator", "Supporter", "Member", "Muted"]) {
          if (!message.guild.roles.cache.find((r) => nm(r.name, rn))) try { await message.guild.roles.create({ name: rn }); } catch {}
        }
        return message.reply("✅ Roles created.").catch(() => {});
      }

      if (modules.tickets && cmd === "ticket") {
        let parent = message.guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, "tickets"));
        if (!parent) try { parent = await message.guild.channels.create({ name: "tickets", type: ChannelType.GuildCategory }); } catch {}
        try {
          const tch = await message.guild.channels.create({
            name: ("ticket-" + message.author.username).slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            type: ChannelType.GuildText, parent: parent?.id,
            permissionOverwrites: [
              { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
              { id: c.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
          });
          await tch.send(message.author.toString() + " Ticket open. `!close` to close.");
          return message.reply("Ticket: " + tch).catch(() => {});
        } catch (e) { return message.reply("Ticket error: " + e.message).catch(() => {}); }
      }
      if (modules.tickets && cmd === "close" && message.channel.name.startsWith("ticket-")) {
        await message.reply("Closing..."); setTimeout(() => message.channel.delete().catch(() => {}), 3000); return;
      }
      if (modules.tokenclaim && cmd === "claimpanel" && isMod) {
        const ch = getCh(gid, "tickets") || message.channel;
        await ch.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Claim").setDescription("Type `!ticket` to open a claim ticket.")] });
        return message.reply("Panel posted.").catch(() => {});
      }

      async function modLog(action, target, reason) {
        const ch = getCh(gid, "modlogs"); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(action).setDescription("**User:** " + target + "\n**By:** " + message.author.tag + "\n**Reason:** " + (reason || "none"))] }).catch(() => {});
      }
      if ((modules.moderation || modules.banbot) && isMod) {
        if (cmd === "ban") {
          const u = message.mentions.members?.first(); if (!u) return message.reply("!ban @user [reason]").catch(() => {});
          try { await u.ban({ reason: args.slice(1).join(" ") || "ban" }); await modLog("Ban", u.user.tag, args.slice(1).join(" ")); return message.reply("Banned " + u.user.tag).catch(() => {}); } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "kick") {
          const u = message.mentions.members?.first(); if (!u) return message.reply("!kick @user").catch(() => {});
          try { await u.kick(args.slice(1).join(" ")); await modLog("Kick", u.user.tag, args.slice(1).join(" ")); return message.reply("Kicked").catch(() => {}); } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "timeout") {
          const u = message.mentions.members?.first(); const mins = parseInt(args[1], 10) || 10;
          if (!u) return message.reply("!timeout @user [mins]").catch(() => {});
          try { await u.timeout(mins * 60000); await modLog("Timeout", u.user.tag, mins + "m"); return message.reply("Timed out").catch(() => {}); } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "warn") {
          const u = message.mentions.users.first(); if (!u) return message.reply("!warn @user").catch(() => {});
          await modLog("Warn", u.tag, args.slice(1).join(" ")); return message.reply("Warned").catch(() => {});
        }
        if (modules.moderation && cmd === "purge" && message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
          const n = Math.min(100, Math.max(1, parseInt(args[0], 10) || 10));
          try { const d = await message.channel.bulkDelete(n, true); return message.channel.send("Purged " + d.size).then((m) => setTimeout(() => m.delete().catch(() => {}), 3000)); } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
      }

      if (modules.voice && (cmd === "joinvc" || cmd === "leavevc")) return message.reply("Voice needs @discordjs/voice extension.").catch(() => {});
      if (modules.music && (cmd === "play" || cmd === "music")) { const ch = getCh(gid, "music"); return message.reply(ch ? "Music on → " + ch : "Music on").catch(() => {}); }
      if (modules.leveling && (cmd === "rank" || cmd === "level")) {
        const u = message.mentions.users.first() || message.author;
        const data = (levels[gid] && levels[gid][u.id]) || { xp: 0, level: 0 };
        return message.reply("**" + u.username + "** Level **" + data.level + "** (" + data.xp + " XP)").catch(() => {});
      }
    });
  }
  return c;
}

let client = createClient(true);
async function start() {
  try { await client.login(creds.botToken); }
  catch (e) {
    if (/disallowed intents/i.test(e.message)) {
      console.error("Enable privileged intents. Reduced start.");
      await client.destroy(); client = createClient(false); await client.login(creds.botToken);
    } else throw e;
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (t) => {
  const cmd = t.trim(); if (!cmd) return;
  if (cmd === "ping") console.log("pong " + client.ws.ping + "ms");
  else if (cmd === "modules") console.log(JSON.stringify(modules, null, 2));
  else console.log("try: ping, modules");
});
process.on("SIGTERM", async () => { await client.destroy(); process.exit(0); });
start().catch((e) => { console.error(e.message); process.exit(1); });
