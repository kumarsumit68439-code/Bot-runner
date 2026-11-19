function getCh(gid, key) {
  const st = guildState.get(gid);
  if (st?.channels?.[key]) return st.channels[key];
  return null;
}
function getRole(gid, key) {
  const st = guildState.get(gid);
  return st?.roles?.[key] || null;
}
function redact(s) {
  return String(s || "").replace(/[a-zA-Z0-9_-]{20,}/g, "[redacted]");
}

const ai = {
  url: creds.aiEndpoint || process.env.AI_ENDPOINT || "",
  model: creds.aiModel || process.env.AI_MODEL || "",
  key: creds.aiApiKey || process.env.AI_API_KEY || "",
};
const aiOn = Boolean(modules.aichat && ai.url && ai.model && ai.key);
let aiQ = Promise.resolve();

async function answerAi(message, prompt) {
  try {
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
  } catch (e) {
    await message.reply("AI error: " + redact(e.message)).catch(() => {});
  }
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
