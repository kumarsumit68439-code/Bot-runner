// Self-contained Discord bot (Railway + Termux). No external parts/chunks.
"use strict";
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
const creds = loadCredentials();
if (!creds.botToken) { console.error("No bot token — set DISCORD_TOKEN or bot-credentials.json"); process.exit(1); }

const modules = { aichat: true, welcome: true, channelbuilder: true, rolesetup: true, ...(loadJson("bot-config.json").modules || {}) };
const nm = (a, b) => String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ai = { url: creds.aiEndpoint || process.env.AI_ENDPOINT || "", model: creds.aiModel || process.env.AI_MODEL || "", key: creds.aiApiKey || process.env.AI_API_KEY || "" };
const aiOn = Boolean(modules.aichat && ai.url && ai.model && ai.key);
let aiQ = Promise.resolve();

async function answerAi(message, prompt) {
  try {
    const headers = { "Content-Type": "application/json" };
    if (ai.key) headers.Authorization = "Bearer " + ai.key;
    const r = await fetch(ai.url, { method: "POST", headers, body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: "Helpful Discord assistant. Concise." }, { role: "user", content: prompt }], max_tokens: 800 }) });
    const j = await r.json().catch(() => ({}));
    const text = j.choices?.[0]?.message?.content || j.content || "No response";
    await message.reply({ content: String(text).slice(0, 1900) }).catch(() => {});
  } catch (e) {
    await message.reply("AI error: " + String(e.message).slice(0, 200)).catch(() => {});
  }
}

async function askAiJson(system, user) {
  const headers = { "Content-Type": "application/json" };
  if (ai.key) headers.Authorization = "Bearer " + ai.key;
  const r = await fetch(ai.url, { method: "POST", headers, body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 2000 }) });
  const j = await r.json().catch(() => ({}));
  let text = j.choices?.[0]?.message?.content || j.content || "{}";
  text = String(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text);
}

async function createChannelsFromPlan(guild, plan) {
  let made = 0;
  for (const c of (plan.categories || []).slice(0, 15)) {
    const name = String(c.name || "Category").trim().slice(0, 100);
    if (!name) continue;
    let cat = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && nm(ch.name, name));
    if (!cat) { try { cat = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: "AI setupchannels" }); made++; } catch { continue; } }
    for (const tn of (c.text || c.channels || []).slice(0, 30)) {
      const n = String(tn || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 90);
      if (!n || guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, n))) continue;
      try { await guild.channels.create({ name: n, type: ChannelType.GuildText, parent: cat.id, reason: "AI setupchannels" }); made++; } catch {}
    }
    for (const vn of (c.voice || []).slice(0, 20)) {
      const n = String(vn || "").trim().slice(0, 100);
      if (!n || guild.channels.cache.find((ch) => ch.parentId === cat.id && nm(ch.name, n))) continue;
      try { await guild.channels.create({ name: n, type: ChannelType.GuildVoice, parent: cat.id, reason: "AI setupchannels" }); made++; } catch {}
    }
  }
  return made;
}

async function createRolesFromPlan(guild, plan) {
  let made = 0;
  for (const r of (plan.roles || []).slice(0, 40)) {
    const name = String(r.name || "").trim().slice(0, 100);
    if (!name || guild.roles.cache.find((x) => nm(x.name, name))) continue;
    const opts = { name, reason: "AI setuproles" };
    if (typeof r.color === "number") opts.color = r.color;
    if (typeof r.hoist === "boolean") opts.hoist = r.hoist;
    if (typeof r.mentionable === "boolean") opts.mentionable = r.mentionable;
    try { await guild.roles.create(opts); made++; } catch {}
  }
  return made;
}

function buildSlash() {
  return [
    new SlashCommandBuilder().setName("ping").setDescription("Latency"),
    new SlashCommandBuilder().setName("help").setDescription("Help"),
    new SlashCommandBuilder().setName("setupchannels").setDescription("AI: create channels").addStringOption((o) => o.setName("prompt").setDescription("Describe layout").setRequired(true)),
    new SlashCommandBuilder().setName("setuproles").setDescription("AI: create roles").addStringOption((o) => o.setName("prompt").setDescription("Describe roles").setRequired(true)),
    new SlashCommandBuilder().setName("ask").setDescription("Ask AI").addStringOption((o) => o.setName("prompt").setDescription("Question").setRequired(true)),
  ].map((c) => c.toJSON());
}

async function registerSlash(client) {
  if (!creds.clientId) return;
  const body = buildSlash();
  const rest = new REST({ version: "10" }).setToken(creds.botToken);
  try {
    await rest.put(Routes.applicationCommands(creds.clientId), { body });
    console.log("[slash] registered", body.length);
  } catch (e) { console.error("[slash]", e.message); }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async () => {
  console.log("Logged in as", client.user.tag);
  console.log("AI:", aiOn ? "ON " + ai.model : "OFF");
  await registerSlash(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, member } = interaction;
  const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator) || member?.permissions?.has(PermissionFlagsBits.ManageGuild);
  try {
    if (commandName === "ping") return interaction.reply("Pong! " + client.ws.ping + "ms");
    if (commandName === "help") return interaction.reply("Slash: `/ping` `/help` `/ask` `/setupchannels` `/setuproles` — AI chat: write in #ai-chat without mention.");
    if (commandName === "ask") {
      if (!aiOn) return interaction.reply({ content: "AI off — set AI endpoint/model/key.", ephemeral: true });
      await interaction.deferReply();
      const prompt = options.getString("prompt", true);
      const name = member?.displayName || interaction.user.username;
      const fake = { reply: async (p) => interaction.editReply(p) };
      await answerAi(fake, name + ": " + prompt);
      return;
    }
    if (commandName === "setupchannels") {
      if (!isAdmin) return interaction.reply({ content: "Admin only.", ephemeral: true });
      if (!aiOn) return interaction.reply({ content: "AI required.", ephemeral: true });
      await interaction.deferReply();
      try {
        const plan = await askAiJson('Reply ONLY JSON: {"categories":[{"name":"Cat","text":["a","b"],"voice":["VC"]}]}', options.getString("prompt", true));
        const n = await createChannelsFromPlan(guild, plan);
        return interaction.editReply("Created/updated ~" + n + " channels from AI plan.");
      } catch (e) { return interaction.editReply("setupchannels failed: " + String(e.message).slice(0, 400)); }
    }
    if (commandName === "setuproles") {
      if (!isAdmin) return interaction.reply({ content: "Admin only.", ephemeral: true });
      if (!aiOn) return interaction.reply({ content: "AI required.", ephemeral: true });
      await interaction.deferReply();
      try {
        const plan = await askAiJson('Reply ONLY JSON: {"roles":[{"name":"Role","color":3447003,"hoist":false,"mentionable":false}]}', options.getString("prompt", true));
        const n = await createRolesFromPlan(guild, plan);
        return interaction.editReply("Created ~" + n + " roles from AI plan.");
      } catch (e) { return interaction.editReply("setuproles failed: " + String(e.message).slice(0, 400)); }
    }
  } catch (e) {
    console.error(e);
    const payload = { content: "Error: " + String(e.message).slice(0, 200), ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = (message.content || "").trim();
  if (aiOn && content) {
    const aiNames = ["ai-chat", "ai", "bot-chat"];
    const chName = message.channel?.name || "";
    const inAi = aiNames.some((n) => nm(chName, n)) || (creds.aiChannelId && message.channelId === creds.aiChannelId);
    if (inAi) {
      const name = message.member?.displayName || message.author.username;
      aiQ = aiQ.then(() => answerAi(message, name + ": " + content.slice(0, 1500))).catch(() => {});
      return;
    }
  }
  if (!content.startsWith("!")) return;
  const [cmd] = content.slice(1).split(/\s+/);
  const c = (cmd || "").toLowerCase();
  if (c === "ping") return message.reply("Pong! " + client.ws.ping + "ms").catch(() => {});
  if (c === "help") return message.reply("Use / slash or !ping !help").catch(() => {});
});

client.login(creds.botToken).catch((e) => { console.error(e.message); process.exit(1); });
