// Discord bot template for the panel daemon. Copy to backend/bot/index.js:
//   cp backend/bot-template/index.js backend/bot/index.js
// Credentials come from bot-credentials.json (written by the panel's "Connection & Bot Setup"),
// falling back to DISCORD_TOKEN / CLIENT_ID in bot/.env or the environment.
const fs = require("fs");
const path = require("path");
try { require("dotenv").config(); } catch {} // optional
const { Client, GatewayIntentBits } = require("discord.js");

function loadCredentials() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(__dirname, "bot-credentials.json"), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Could not read bot-credentials.json:", e.message);
  }
  return {
    botToken: String(file.botToken || "").trim() || process.env.DISCORD_TOKEN || "",
    clientId: String(file.clientId || "").trim() || process.env.CLIENT_ID || "",
  };
}

const { botToken, clientId } = loadCredentials();
if (!botToken) {
  console.error("No bot token found. Enter it in the panel (Connection & Bot Setup) or set DISCORD_TOKEN in bot/.env.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag} (client id: ${clientId || client.user.id})`);
});

// Commands typed in the panel console arrive on stdin.
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const cmd = chunk.trim();
  if (!cmd) return;
  if (cmd === "ping") console.log(`pong ${client.ws.ping}ms`);
  else if (cmd === "guilds") console.log(`In ${client.guilds.cache.size} server(s)`);
  else console.log(`Unknown command: ${cmd} (try: ping, guilds)`);
});

process.on("SIGTERM", async () => {
  await client.destroy();
  process.exit(0);
});

client.login(botToken).catch((e) => {
  console.error("Login failed:", e.message);
  process.exit(1);
});
