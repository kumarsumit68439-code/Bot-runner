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
  let all = {}; try { all = JSON.parse(fs.readFileSync(OV, "utf8")); } catch {}
  if (!all[gid]) all[gid] = {};
  all[gid][key] = id;
  fs.writeFileSync(OV, JSON.stringify(all, null, 2));
  const s = guildState.get(gid);
  if (s) s.overrides[key] = id;
}
async function resolveGuild(guild) {
  const st = { channels: {}, roles: {}, overrides: loadOv(guild.id), invites: new Map() };
  for (const key of Object.keys(CHANNEL_NAMES)) {
    if (st.overrides[key]) {
      const ch = guild.channels.cache.get(st.overrides[key]);
      if (ch) { st.channels[key] = ch; continue; }
    }
    st.channels[key] = await ensureText(guild, key);
  }
  st.roles.supporter = await ensureRole(guild, "supporter");
  guildState.set(guild.id, st);
  if (modules.invitetracker) {
    try { (await guild.invites.fetch()).forEach((i) => st.invites.set(i.code, i.uses || 0)); } catch {}
  }
  return st;
}
function getCh(gid, k) { return guildState.get(gid)?.channels?.[k] || null; }
function getRole(gid, k) { return guildState.get(gid)?.roles?.[k] || null; }

function chatUrl(ep) {
  const b = String(ep || "").trim().replace(/\/+$/, "");
  return !b ? "" : (/\/chat\/completions$/.test(b) ? b : b + "/chat/completions");
}
const ai = { url: chatUrl(creds.aiEndpoint), model: creds.aiModel, key: creds.aiApiKey };
const aiOn = Boolean(modules.aichat && ai.url && ai.model && ai.key);
const histMap = new Map();
let aiQ = Promise.resolve();
const redact = (t) => (ai.key ? String(t).split(ai.key).join("***") : String(t));

async function askAi(hist) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(ai.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ai.key },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: "system", content: "Friendly Discord assistant. Under 1500 chars." }, ...hist],
      }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    if (!res.ok) throw new Error("HTTP " + res.status);
    return String(data?.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } finally { clearTimeout(timer); }
}
function chunk(text, size = 1900) {
  const out = [];
  let r = text;
  while (r.length > size) {
    let c = r.lastIndexOf("\n", size);
    if (c < size * 0.5) c = size;
    out.push(r.slice(0, c));
    r = r.slice(c).replace(/^\n/, "");
  }
  if (r) out.push(r);
  return out;
}
const NO_PINGS = { parse: [], repliedUser: false };

async function answerAi(msg, line) {
  const cid = msg.channelId;
  if (!histMap.has(cid)) histMap.set(cid, []);
  const hist = histMap.get(cid);
  hist.push({ role: "user", content: line });
  while (hist.length > 12) hist.shift();
  const typing = setInterval(() => { try { msg.channel.sendTyping().catch(() => {}); } catch {} }, 8000);
  try {
    const reply = await askAi(hist);
    const text = reply || "Empty.";
    if (reply) hist.push({ role: "assistant", content: reply });
    const parts = chunk(text);
    if (msg.reply) await msg.reply({ content: parts[0], allowedMentions: NO_PINGS });
    else await msg.channel.send({ content: parts[0], allowedMentions: NO_PINGS });
    for (const p of parts.slice(1)) await msg.channel.send({ content: p, allowedMentions: NO_PINGS });
  } catch (e) {
    hist.pop();
    const err = "AI error: " + redact(e.message).slice(0, 300);
    if (msg.reply) await msg.reply({ content: err, allowedMentions: NO_PINGS }).catch(() => {});
    else await msg.channel.send({ content: err }).catch(() => {});
  } finally { clearInterval(typing); }
}

const LF = path.join(__dirname, "levels-data.json");
let levels = {};
try { levels = JSON.parse(fs.readFileSync(LF, "utf8")); } catch {}
function saveLevels() { try { fs.writeFileSync(LF, JSON.stringify(levels)); } catch {} }
function addXp(gid, uid, amt) {
  if (!levels[gid]) levels[gid] = {};
  if (!levels[gid][uid]) levels[gid][uid] = { xp: 0, level: 0 };
  const u = levels[gid][uid];
  u.xp += amt;
  const need = (u.level + 1) * 100;
  if (u.xp >= need) { u.xp -= need; u.level++; saveLevels(); return u.level; }
  saveLevels();
  return null;
}

const joinBuckets = new Map();
const spamMap = new Map();
const nukeBuckets = new Map();

function buildSlashCommands() {
  const cmds = [];
  const add = (b) => cmds.push(b.toJSON());

  add(new SlashCommandBuilder().setName("ping").setDescription("Bot latency"));
  add(new SlashCommandBuilder().setName("help").setDescription("List bot commands"));
  add(new SlashCommandBuilder().setName("modules").setDescription("Show which modules are ON"));
  add(
    new SlashCommandBuilder()
      .setName("set")
      .setDescription("Bind this channel to a module (no Channel ID needed)")
      .addStringOption((o) =>
        o.setName("module").setDescription("Module key").setRequired(true).addChoices(
          { name: "welcome", value: "welcome" },
          { name: "support", value: "support" },
          { name: "tickets", value: "tickets" },
          { name: "modlogs", value: "modlogs" },
          { name: "protectlogs", value: "protectlogs" },
          { name: "levels", value: "levels" },
          { name: "memberadd", value: "memberadd" },
          { name: "aichat", value: "aichat" },
          { name: "music", value: "music" },
          { name: "invites", value: "invites" },
          { name: "generalvc", value: "generalvc" }
        )
      )
  );

  if (modules.simple) {
    add(new SlashCommandBuilder().setName("serverinfo").setDescription("Server info"));
    add(new SlashCommandBuilder().setName("userinfo").setDescription("User info").addUserOption((o) => o.setName("user").setDescription("User")));
    add(new SlashCommandBuilder().setName("avatar").setDescription("Show avatar").addUserOption((o) => o.setName("user").setDescription("User")));
  }
  if (modules.channelbuilder) {
    add(new SlashCommandBuilder().setName("setupchannels").setDescription("Create categories, text & voice channels (Admin)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator));
  }
  if (modules.rolesetup) {
    add(new SlashCommandBuilder().setName("setuproles").setDescription("Create standard roles (Admin)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator));
  }
  if (modules.tickets) {
    add(new SlashCommandBuilder().setName("ticket").setDescription("Open a support ticket"));
    add(new SlashCommandBuilder().setName("close").setDescription("Close this ticket channel"));
  }
  if (modules.tokenclaim) {
    add(new SlashCommandBuilder().setName("claimpanel").setDescription("Post a claim panel").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers));
  }
  if (modules.moderation || modules.banbot) {
    add(new SlashCommandBuilder().setName("ban").setDescription("Ban a member").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Reason")));
  }
  if (modules.moderation) {
    add(new SlashCommandBuilder().setName("kick").setDescription("Kick a member").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Reason")));
    add(new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption((o) => o.setName("minutes").setDescription("Minutes").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Reason")));
    add(new SlashCommandBuilder().setName("warn").setDescription("Warn a member").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Reason")));
    add(new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption((o) => o.setName("count").setDescription("1-100").setRequired(true)));
  }
  if (modules.leveling) {
    add(new SlashCommandBuilder().setName("rank").setDescription("Show XP / level").addUserOption((o) => o.setName("user").setDescription("User")));
  }
  if (modules.voice) {
    add(new SlashCommandBuilder().setName("joinvc").setDescription("Join voice (needs voice lib)"));
    add(new SlashCommandBuilder().setName("leavevc").setDescription("Leave voice (needs voice lib)"));
  }
  if (modules.music) {
    add(new SlashCommandBuilder().setName("play").setDescription("Play music (scaffold)").addStringOption((o) => o.setName("query").setDescription("Song / URL")));
    add(new SlashCommandBuilder().setName("stop").setDescription("Stop music (scaffold)"));
  }
  if (modules.aichat) {
    add(new SlashCommandBuilder().setName("ask").setDescription("Ask the AI").addStringOption((o) => o.setName("prompt").setDescription("Your question").setRequired(true)));
  }
  if (modules.welcome) {
    add(new SlashCommandBuilder().setName("testwelcome").setDescription("Send a test welcome message").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
  }
  if (modules.support) {
    add(new SlashCommandBuilder().setName("support").setDescription("Where is the support channel?"));
  }
  if (modules.invitetracker) {
    add(new SlashCommandBuilder().setName("invites").setDescription("Invite tracker info"));
  }
  if (modules.protect || modules.antinuke) {
    add(new SlashCommandBuilder().setName("protectstatus").setDescription("Server protection status").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
  }
  if (modules.supporter) {
    add(new SlashCommandBuilder().setName("supporter").setDescription("Info about Supporter auto-role"));
  }
  if (modules.memberadd) {
    add(new SlashCommandBuilder().setName("memberlog").setDescription("Where join logs go").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
  }
  return cmds;
}

async function registerSlashCommands(client) {
  const body = buildSlashCommands();
  const rest = new REST({ version: "10" }).setToken(creds.botToken);
  const appId = client.user.id;
  try {
    await rest.put(Routes.applicationCommands(appId), { body });
    console.log(`[slash] Registered ${body.length} GLOBAL commands`);
  } catch (e) {
    console.error("[slash] global register failed:", e.message);
  }
  for (const [, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body });
      await guild.commands.set(body).catch(() => {});
      console.log(`[slash] Registered ${body.length} commands in ${guild.name}`);
    } catch (e) {
      console.error(`[slash] guild ${guild.name}:`, e.message);
    }
  }
}

async function modLog(guildId, action, target, by, reason) {
  const ch = getCh(guildId, "modlogs");
  if (ch) {
    ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle(action)
          .setDescription(`**User:** ${target}\n**By:** ${by}\n**Reason:** ${reason || "none"}`)
          .setTimestamp(),
      ],
    }).catch(() => {});
  }
}

async function handleSlash(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member, options, user } = interaction;
  if (!guild) return interaction.reply({ content: "Server only.", ephemeral: true }).catch(() => {});
  const gid = guild.id;
  if (!guildState.has(gid)) await resolveGuild(guild);

  const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);
  const isMod = isAdmin || member?.permissions?.has(PermissionFlagsBits.ModerateMembers) || member?.permissions?.has(PermissionFlagsBits.KickMembers);

  try {
    if (commandName === "ping") return interaction.reply(`Pong! ${client.ws.ping}ms`);
    if (commandName === "help") {
      return interaction.reply({
        content: "Slash: `/ping` `/help` `/modules` `/set` `/serverinfo` `/userinfo` `/avatar` `/ticket` `/close` `/ban` `/kick` `/timeout` `/warn` `/purge` `/rank` `/setupchannels` `/setuproles` `/claimpanel` `/ask` `/play` …\nPrefix `!` still works.",
        ephemeral: true,
      });
    }
    if (commandName === "modules") {
      const on = Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ");
      return interaction.reply({ content: `Modules ON: ${on || "none"}`, ephemeral: true });
    }
    if (commandName === "set") {
      if (!member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: "Need Manage Channels.", ephemeral: true });
      }
      const key = options.getString("module", true);
      if (!CHANNEL_NAMES[key]) return interaction.reply({ content: "Unknown module key.", ephemeral: true });
      saveOv(gid, key, interaction.channelId);
      const st = guildState.get(gid);
      if (st) st.channels[key] = interaction.channel;
      return interaction.reply(`✅ Bound **${key}** → ${interaction.channel}`);
    }
    if (commandName === "serverinfo") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setTitle(guild.name).addFields(
            { name: "Members", value: String(guild.memberCount), inline: true },
            { name: "Channels", value: String(guild.channels.cache.size), inline: true },
            { name: "Roles", value: String(guild.roles.cache.size), inline: true }
          ).setTimestamp(),
        ],
      });
    }
    if (commandName === "userinfo") {
      const u = options.getUser("user") || user;
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setTitle(u.tag).setThumbnail(u.displayAvatarURL()).addFields(
            { name: "ID", value: u.id, inline: true },
            { name: "Created", value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true }
          ),
        ],
      });
    }
    if (commandName === "avatar") {
      const u = options.getUser("user") || user;
      return interaction.reply(u.displayAvatarURL({ size: 512 }));
    }
    if (commandName === "setupchannels") {
      if (!isAdmin) return interaction.reply({ content: "Admin only.", ephemeral: true });
      await interaction.deferReply();
      for (const name of ["INFO", "GENERAL", "VOICE", "STAFF"]) {
        let cat = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, name));
        if (!cat) { try { cat = await guild.channels.create({ name, type: ChannelType.GuildCategory }); } catch {} }
        if (name === "GENERAL" && cat) {
          for (const tn of ["chat", "media", "bots"]) {
            if (!guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, tn))) {
              try { await guild.channels.create({ name: tn, type: ChannelType.GuildText, parent: cat.id }); } catch {}
            }
          }
        }
        if (name === "VOICE" && cat) {
          for (const vn of ["General VC", "Music", "AFK"]) {
            if (!guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, vn))) {
              try { await guild.channels.create({ name: vn, type: ChannelType.GuildVoice, parent: cat.id }); } catch {}
            }
          }
        }
      }
      return interaction.editReply("✅ Channels / VC structure ready.");
    }
    if (commandName === "setuproles") {
      if (!isAdmin) return interaction.reply({ content: "Admin only.", ephemeral: true });
      for (const rn of ["Owner", "Admin", "Moderator", "Supporter", "Member", "Muted"]) {
        if (!guild.roles.cache.find((r) => nm(r.name, rn))) {
          try { await guild.roles.create({ name: rn }); } catch {}
        }
      }
      return interaction.reply("✅ Roles created.");
    }
    if (commandName === "ticket") {
      await interaction.deferReply({ ephemeral: true });
      let parent = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, "tickets"));
      if (!parent) { try { parent = await guild.channels.create({ name: "tickets", type: ChannelType.GuildCategory }); } catch {} }
      try {
        const tch = await guild.channels.create({
          name: (`ticket-${user.username}`).slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          type: ChannelType.GuildText,
          parent: parent?.id,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ],
        });
        await tch.send(`${user} Ticket open. Use \`/close\` or \`!close\`.`);
        return interaction.editReply(`Ticket: ${tch}`);
      } catch (e) {
        return interaction.editReply("Ticket error: " + e.message);
      }
    }
    if (commandName === "close") {
      if (!interaction.channel?.name?.startsWith("ticket-")) {
        return interaction.reply({ content: "Not a ticket channel.", ephemeral: true });
      }
      await interaction.reply("Closing in 3s…");
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return;
    }
    if (commandName === "claimpanel") {
      if (!isMod) return interaction.reply({ content: "Mod only.", ephemeral: true });
      const ch = getCh(gid, "tickets") || interaction.channel;
      await ch.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Claim").setDescription("Use `/ticket` to open a claim ticket.")] });
      return interaction.reply({ content: "Panel posted.", ephemeral: true });
    }
    if (commandName === "ban") {
      if (!isMod) return interaction.reply({ content: "No permission.", ephemeral: true });
      const target = options.getUser("user", true);
      const reason = options.getString("reason") || "No reason";
      const mem = await guild.members.fetch(target.id).catch(() => null);
      if (!mem) return interaction.reply({ content: "User not in server.", ephemeral: true });
      try {
        await mem.ban({ reason });
        await modLog(gid, "Ban", target.tag, user.tag, reason);
        return interaction.reply(`Banned ${target.tag}`);
      } catch (e) {
        return interaction.reply({ content: e.message, ephemeral: true });
      }
    }
    if (commandName === "kick") {
      if (!isMod) return interaction.reply({ content: "No permission.", ephemeral: true });
      const target = options.getUser("user", true);
      const reason = options.getString("reason") || "No reason";
      const mem = await guild.members.fetch(target.id).catch(() => null);
      if (!mem) return interaction.reply({ content: "User not in server.", ephemeral: true });
      try {
        await mem.kick(reason);
        await modLog(gid, "Kick", target.tag, user.tag, reason);
        return interaction.reply(`Kicked ${target.tag}`);
      } catch (e) {
        return interaction.reply({ content: e.message, ephemeral: true });
      }
    }
    if (commandName === "timeout") {
      if (!isMod) return interaction.reply({ content: "No permission.", ephemeral: true });
      const target = options.getUser("user", true);
      const mins = options.getInteger("minutes", true);
      const reason = options.getString("reason") || "timeout";
      const mem = await guild.members.fetch(target.id).catch(() => null);
      if (!mem) return interaction.reply({ content: "User not in server.", ephemeral: true });
      try {
        await mem.timeout(Math.min(mins, 10080) * 60000, reason);
        await modLog(gid, "Timeout", target.tag, user.tag, `${mins}m — ${reason}`);
        return interaction.reply(`Timed out ${target.tag} for ${mins}m`);
      } catch (e) {
        return interaction.reply({ content: e.message, ephemeral: true });
      }
    }
    if (commandName === "warn") {
      if (!isMod) return interaction.reply({ content: "No permission.", ephemeral: true });
      const target = options.getUser("user", true);
      const reason = options.getString("reason") || "No reason";
      await modLog(gid, "Warn", target.tag, user.tag, reason);
      return interaction.reply(`Warned ${target.tag}`);
    }
    if (commandName === "purge") {
      if (!member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "Need Manage Messages.", ephemeral: true });
      }
      const n = Math.min(100, Math.max(1, options.getInteger("count", true)));
      await interaction.deferReply({ ephemeral: true });
      try {
        const deleted = await interaction.channel.bulkDelete(n, true);
        return interaction.editReply(`Purged ${deleted.size} messages.`);
      } catch (e) {
        return interaction.editReply(e.message);
      }
    }
    if (commandName === "rank") {
      const u = options.getUser("user") || user;
      const data = (levels[gid] && levels[gid][u.id]) || { xp: 0, level: 0 };
      return interaction.reply(`**${u.username}** — Level **${data.level}** (${data.xp} XP)`);
    }
    if (commandName === "joinvc" || commandName === "leavevc") {
      return interaction.reply({ content: "Voice needs `@discordjs/voice` extension (scaffold).", ephemeral: true });
    }
    if (commandName === "play" || commandName === "stop") {
      const ch = getCh(gid, "music");
      return interaction.reply({
        content: ch ? `Music module on. Prefer ${ch}.` : "Music module on; #music auto-created.",
        ephemeral: true,
      });
    }
    if (commandName === "ask") {
      if (!aiOn) return interaction.reply({ content: "AI is off (module / API key).", ephemeral: true });
      const prompt = options.getString("prompt", true);
      await interaction.deferReply();
      const name = member?.displayName || user.username;
      const fake = {
        channelId: interaction.channelId,
        channel: interaction.channel,
        reply: async (payload) => interaction.editReply(payload),
      };
      await answerAi(fake, `${name}: ${prompt.slice(0, 1500)}`);
      return;
    }
    if (commandName === "testwelcome") {
      const ch = getCh(gid, "welcome");
      if (!ch) return interaction.reply({ content: "No #welcome channel.", ephemeral: true });
      await ch.send({
        embeds: [
          new EmbedBuilder().setColor(0x57f287).setTitle("Welcome! (test)").setDescription(`Hey ${user}, welcome to **${guild.name}**!`).setThumbnail(user.displayAvatarURL()),
        ],
      });
      return interaction.reply({ content: `Sent test to ${ch}`, ephemeral: true });
    }
    if (commandName === "support") {
      const ch = getCh(gid, "support");
      return interaction.reply(ch ? `Support channel: ${ch}` : "Support channel not resolved yet.");
    }
    if (commandName === "invites") {
      return interaction.reply({ content: "Invite tracker logs inviters on join → #member-add / #invites.", ephemeral: true });
    }
    if (commandName === "protectstatus") {
      return interaction.reply({
        content: `Protection: ${modules.protect ? "ON" : "OFF"} · Anti-Nuke: ${modules.antinuke ? "ON" : "OFF"}`,
        ephemeral: true,
      });
    }
    if (commandName === "supporter") {
      const role = getRole(gid, "supporter");
      return interaction.reply(role ? `Supporter auto-role: ${role}` : "Supporter role will be auto-created.");
    }
    if (commandName === "memberlog") {
      const ch = getCh(gid, "memberadd");
      return interaction.reply({ content: ch ? `Join logs → ${ch}` : "member-add channel not ready.", ephemeral: true });
    }
    return interaction.reply({ content: "Unknown command.", ephemeral: true });
  } catch (e) {
    console.error("slash error:", e.message);
    const payload = { content: "Error: " + e.message.slice(0, 200), ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

function createClient(withMsg) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites];
  if (withMsg) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions);
  const c = new Client({ intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction] });

  c.once(Events.ClientReady, async () => {
    console.log("Logged in as " + c.user.tag);
    console.log("Modules ON:", Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ") || "(none)");
    for (const [, g] of c.guilds.cache) {
      try { await resolveGuild(g); } catch (e) { console.error(e.message); }
    }
    console.log(aiOn ? "AI ON " + ai.model : "AI OFF");
    await registerSlashCommands(c);
  });

  c.on(Events.GuildCreate, async (g) => {
    try {
      await resolveGuild(g);
      const body = buildSlashCommands();
      const rest = new REST({ version: "10" }).setToken(creds.botToken);
      await rest.put(Routes.applicationGuildCommands(c.user.id, g.id), { body });
      await g.commands.set(body).catch(() => {});
      console.log(`[slash] Registered on new guild ${g.name}`);
    } catch (e) {
      console.error(e.message);
    }
  });

  c.on(Events.InteractionCreate, (interaction) => handleSlash(interaction, c));

  c.on(Events.GuildMemberAdd, async (member) => {
    const gid = member.guild.id;
    if (!guildState.has(gid)) await resolveGuild(member.guild);
    const st = guildState.get(gid);

    if (modules.antinuke || modules.protect) {
      const now = Date.now();
      let b = (joinBuckets.get(gid) || []).filter((t) => now - t < 10000);
      b.push(now);
      joinBuckets.set(gid, b);
      if (b.length >= 8) {
        const ch = getCh(gid, "protectlogs") || getCh(gid, "modlogs");
        if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Anti-Raid").setDescription("≥8 joins/10s: " + member.user.tag)] }).catch(() => {});
      }
    }

    if (modules.welcome) {
      const ch = getCh(gid, "welcome");
      if (ch) {
        ch.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("Welcome!").setDescription(`Hey ${member}, welcome to **${member.guild.name}**!`).setThumbnail(member.user.displayAvatarURL())] }).catch(() => {});
      }
    }

    let inviter = "unknown";
    if (modules.invitetracker && st) {
      try {
        const invs = await member.guild.invites.fetch();
        for (const [code, inv] of invs) {
          const prev = st.invites.get(code) || 0;
          if ((inv.uses || 0) > prev) { inviter = inv.inviter?.tag || "vanity"; break; }
        }
        st.invites.clear();
        invs.forEach((i) => st.invites.set(i.code, i.uses || 0));
      } catch {}
    }

    if (modules.memberadd || modules.invitetracker) {
      const ch = getCh(gid, "memberadd") || getCh(gid, "invites");
      const age = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
      if (ch) ch.send(`📥 **${member.user.tag}** joined (age ${age}d)` + (modules.invitetracker ? ` via **${inviter}**` : "")).catch(() => {});
    }

    if (modules.supporter) {
      const role = getRole(gid, "supporter");
      if (role) member.roles.add(role).catch(() => {});
    }
  });

  if (modules.antinuke) {
    c.on(Events.ChannelDelete, async (channel) => {
      if (!channel.guild) return;
      const gid = channel.guild.id;
      const now = Date.now();
      let b = (nukeBuckets.get(gid) || []).filter((t) => now - t < 15000);
      b.push(now);
      nukeBuckets.set(gid, b);
      if (b.length >= 3) {
        const ch = getCh(gid, "modlogs") || getCh(gid, "protectlogs");
        if (ch) ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Anti-Nuke").setDescription("Multiple channel deletes incl. #" + channel.name)] }).catch(() => {});
      }
    });
  }

  if (withMsg) {
    c.on(Events.MessageCreate, async (message) => {
      if (message.author.bot || !message.guild) return;
      const gid = message.guild.id;
      if (!guildState.has(gid)) await resolveGuild(message.guild);
      const content = String(message.cleanContent || "").trim();
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
      const isMod = isAdmin || message.member?.permissions?.has(PermissionFlagsBits.ModerateMembers) || message.member?.permissions?.has(PermissionFlagsBits.KickMembers);

      if (modules.protect && content) {
        const invite = /(discord\.gg|discord\.com\/invite)\//i.test(content);
        const many = message.mentions.users.size + message.mentions.roles.size >= 5;
        const key = message.author.id;
        const now = Date.now();
        let s = spamMap.get(key) || { count: 0, last: 0 };
        if (now - s.last < 4000) s.count++; else s.count = 1;
        s.last = now;
        spamMap.set(key, s);
        if (invite || many || s.count >= 6) {
          try { await message.delete(); } catch {}
          const logCh = getCh(gid, "protectlogs") || getCh(gid, "modlogs");
          if (logCh) logCh.send("🛡️ Deleted **" + message.author.tag + "**").catch(() => {});
          return;
        }
      }

      if (modules.leveling && content.length > 2) {
        const nl = addXp(gid, message.author.id, 10 + Math.min(20, content.length / 10));
        if (nl !== null) {
          const ch = getCh(gid, "levels") || message.channel;
          ch.send(`🎉 ${message.author} reached **level ${nl}**!`).catch(() => {});
        }
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
      const parts = content.slice(1).split(/\s+/);
      const cmd = (parts[0] || "").toLowerCase();
      const args = parts.slice(1);

      if (cmd === "set" && message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
        const mod = (args[0] || "").toLowerCase().replace(/[^a-z]/g, "");
        const alias = { ai: "aichat", logs: "modlogs", protect: "protectlogs", level: "levels", join: "memberadd", ticket: "tickets", vc: "generalvc", invite: "invites" };
        const key = alias[mod] || mod;
        if (!CHANNEL_NAMES[key]) return message.reply("Unknown. " + Object.keys(CHANNEL_NAMES).join(", ")).catch(() => {});
        saveOv(gid, key, message.channel.id);
        const st = guildState.get(gid);
        if (st) st.channels[key] = message.channel;
        return message.reply("✅ Bound **" + key + "** → " + message.channel).catch(() => {});
      }

      if (cmd === "ping") return message.reply("Pong! " + c.ws.ping + "ms").catch(() => {});
      if (cmd === "help") return message.reply("Use `/` slash or `!ping !serverinfo !userinfo !avatar !rank !ticket !close !warn !kick !ban !timeout !purge !setupchannels !setuproles !modules !set`").catch(() => {});
      if (cmd === "serverinfo") {
        return message.reply({ embeds: [new EmbedBuilder().setTitle(message.guild.name).addFields({ name: "Members", value: String(message.guild.memberCount), inline: true }, { name: "Channels", value: String(message.guild.channels.cache.size), inline: true })] }).catch(() => {});
      }
      if (cmd === "userinfo") {
        const u = message.mentions.users.first() || message.author;
        return message.reply({ embeds: [new EmbedBuilder().setTitle(u.tag).setThumbnail(u.displayAvatarURL()).addFields({ name: "ID", value: u.id })] }).catch(() => {});
      }
      if (cmd === "avatar") {
        const u = message.mentions.users.first() || message.author;
        return message.reply(u.displayAvatarURL({ size: 512 })).catch(() => {});
      }
      if (cmd === "modules") return message.reply("ON: " + Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(", ")).catch(() => {});

      if (modules.channelbuilder && cmd === "setupchannels" && isAdmin) {
        for (const name of ["INFO", "GENERAL", "VOICE", "STAFF"]) {
          let cat = message.guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, name));
          if (!cat) { try { cat = await message.guild.channels.create({ name, type: ChannelType.GuildCategory }); } catch {} }
          if (name === "GENERAL" && cat) {
            for (const tn of ["chat", "media", "bots"]) {
              if (!message.guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, tn))) {
                try { await message.guild.channels.create({ name: tn, type: ChannelType.GuildText, parent: cat.id }); } catch {}
              }
            }
          }
          if (name === "VOICE" && cat) {
            for (const vn of ["General VC", "Music", "AFK"]) {
              if (!message.guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, vn))) {
                try { await message.guild.channels.create({ name: vn, type: ChannelType.GuildVoice, parent: cat.id }); } catch {}
              }
            }
          }
        }
        return message.reply("✅ Channels/VC created.").catch(() => {});
      }
      if (modules.rolesetup && cmd === "setuproles" && isAdmin) {
        for (const rn of ["Owner", "Admin", "Moderator", "Supporter", "Member", "Muted"]) {
          if (!message.guild.roles.cache.find((r) => nm(r.name, rn))) {
            try { await message.guild.roles.create({ name: rn }); } catch {}
          }
        }
        return message.reply("✅ Roles created.").catch(() => {});
      }
      if (modules.tickets && cmd === "ticket") {
        let parent = message.guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, "tickets"));
        if (!parent) { try { parent = await message.guild.channels.create({ name: "tickets", type: ChannelType.GuildCategory }); } catch {} }
        try {
          const tch = await message.guild.channels.create({
            name: ("ticket-" + message.author.username).slice(0, 90).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            type: ChannelType.GuildText,
            parent: parent?.id,
            permissionOverwrites: [
              { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
              { id: c.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
          });
          await tch.send(message.author.toString() + " Ticket open. `/close` or `!close`.");
          return message.reply("Ticket: " + tch).catch(() => {});
        } catch (e) {
          return message.reply("Ticket error: " + e.message).catch(() => {});
        }
      }
      if (modules.tickets && cmd === "close" && message.channel.name.startsWith("ticket-")) {
        await message.reply("Closing...");
        setTimeout(() => message.channel.delete().catch(() => {}), 3000);
        return;
      }
      if (modules.tokenclaim && cmd === "claimpanel" && isMod) {
        const ch = getCh(gid, "tickets") || message.channel;
        await ch.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Claim").setDescription("Use `/ticket` to open a claim ticket.")] });
        return message.reply("Panel posted.").catch(() => {});
      }
      if ((modules.moderation || modules.banbot) && isMod) {
        if (cmd === "ban") {
          const u = message.mentions.members?.first();
          if (!u) return message.reply("!ban @user [reason]").catch(() => {});
          try {
            await u.ban({ reason: args.slice(1).join(" ") || "ban" });
            await modLog(gid, "Ban", u.user.tag, message.author.tag, args.slice(1).join(" "));
            return message.reply("Banned " + u.user.tag).catch(() => {});
          } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "kick") {
          const u = message.mentions.members?.first();
          if (!u) return message.reply("!kick @user").catch(() => {});
          try {
            await u.kick(args.slice(1).join(" "));
            await modLog(gid, "Kick", u.user.tag, message.author.tag, args.slice(1).join(" "));
            return message.reply("Kicked").catch(() => {});
          } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "timeout") {
          const u = message.mentions.members?.first();
          const mins = parseInt(args[1], 10) || 10;
          if (!u) return message.reply("!timeout @user [mins]").catch(() => {});
          try {
            await u.timeout(mins * 60000);
            await modLog(gid, "Timeout", u.user.tag, message.author.tag, mins + "m");
            return message.reply("Timed out").catch(() => {});
          } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
        if (modules.moderation && cmd === "warn") {
          const u = message.mentions.users.first();
          if (!u) return message.reply("!warn @user").catch(() => {});
          await modLog(gid, "Warn", u.tag, message.author.tag, args.slice(1).join(" "));
          return message.reply("Warned").catch(() => {});
        }
        if (modules.moderation && cmd === "purge" && message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
          const n = Math.min(100, Math.max(1, parseInt(args[0], 10) || 10));
          try {
            const d = await message.channel.bulkDelete(n, true);
            return message.channel.send("Purged " + d.size).then((m) => setTimeout(() => m.delete().catch(() => {}), 3000));
          } catch (e) { return message.reply(e.message).catch(() => {}); }
        }
      }
      if (modules.voice && (cmd === "joinvc" || cmd === "leavevc")) {
        return message.reply("Voice needs @discordjs/voice extension.").catch(() => {});
      }
      if (modules.music && (cmd === "play" || cmd === "music")) {
        const ch = getCh(gid, "music");
        return message.reply(ch ? "Music on → " + ch : "Music on").catch(() => {});
      }
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
  try {
    await client.login(creds.botToken);
  } catch (e) {
    if (/disallowed intents/i.test(e.message)) {
      console.error("Enable privileged intents. Reduced start.");
      await client.destroy();
      client = createClient(false);
      await client.login(creds.botToken);
    } else throw e;
  }
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (t) => {
  const cmd = t.trim();
  if (!cmd) return;
  if (cmd === "ping") console.log("pong " + client.ws.ping + "ms");
  else if (cmd === "modules") console.log(JSON.stringify(modules, null, 2));
  else if (cmd === "slash") registerSlashCommands(client).catch((e) => console.error(e.message));
  else console.log("try: ping, modules, slash");
});
process.on("SIGTERM", async () => {
  await client.destroy();
  process.exit(0);
});
start().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
