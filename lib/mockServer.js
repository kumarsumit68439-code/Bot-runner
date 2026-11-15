// In-browser fake daemon so the panel is fully usable on Vercel with no backend.
const C = (n, t) => `\x1b[${n}m${t}\x1b[0m`;

export function createMockServer(emit) {
  const files = {
    "index.js": `const { Client, GatewayIntentBits } = require("discord.js");\nrequire("dotenv").config();\n\nconst client = new Client({ intents: [GatewayIntentBits.Guilds] });\n\nclient.once("ready", () => console.log(\`Logged in as \${client.user.tag}\`));\n\nclient.login(process.env.DISCORD_TOKEN);\n`,
    ".env": "DISCORD_TOKEN=your-token-here\nCLIENT_ID=000000000000000000\n",
    "package.json": JSON.stringify({ name: "my-bot", version: "1.0.0", main: "index.js", dependencies: { "discord.js": "^14.16.0", dotenv: "^16.4.5" } }, null, 2) + "\n",
  };
  let settings = { startupCommand: "node index.js", nodeVersion: "20", autoRestart: true };
  let status = "offline", stopping = false, startedAt = 0, boot, tick, chat;

  const reply = (m) => setTimeout(() => emit(m), 80);
  const out = (t) => emit({ type: "console", data: t + "\r\n" });
  const setStatus = (s) => { status = s; emit({ type: "status", state: s }); };
  const zero = () => emit({ type: "stats", cpu: 0, ram: 0, ramLimit: 512, uptime: 0 });
  const clear = () => { clearTimeout(boot); clearInterval(tick); clearInterval(chat); };

  function start() {
    if (status !== "offline") return;
    setStatus("starting");
    out(C(36, "[daemon]") + ` Running: ${settings.startupCommand}`);
    boot = setTimeout(() => {
      startedAt = Date.now();
      setStatus("online");
      out(C(32, "[bot]") + " Logged in as MyBot#0001");
      tick = setInterval(() => emit({
        type: "stats",
        cpu: +(2 + Math.random() * 10).toFixed(1),
        ram: Math.round(95 + Math.random() * 40),
        ramLimit: 512,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      }), 1000);
      chat = setInterval(() => out(C(90, new Date().toLocaleTimeString()) + " Heartbeat acknowledged"), 7000);
    }, 2000);
  }

  function stop(then) {
    if (status === "offline" || stopping) return;
    stopping = true;
    clear();
    out(C(33, "[daemon]") + " Stopping process...");
    setTimeout(() => {
      out(C(31, "[daemon]") + " Process exited with code 0");
      stopping = false;
      setStatus("offline");
      zero();
      then?.();
    }, 800);
  }

  function command(c) {
    out(C(90, "> ") + c);
    if (c === "help") out("Commands: help, ping, stats");
    else if (c === "ping") out("pong! 42ms");
    else if (c === "stats") out(`uptime: ${Math.floor((Date.now() - startedAt) / 1000)}s`);
    else out(C(31, `Unknown command: ${c}`));
  }

  setTimeout(() => {
    emit({ type: "status", state: "offline" });
    zero();
    out(C(35, "BotHost demo mode") + " - set NEXT_PUBLIC_WS_URL to connect a real daemon.");
    out("Press Start to boot the fake bot.");
  }, 0);

  function send(msg) {
    switch (msg.type) {
      case "power":
        if (msg.action === "start") start();
        if (msg.action === "stop") stop();
        if (msg.action === "restart") status === "offline" ? start() : stop(start);
        break;
      case "command": if (status === "online") command(msg.data); break;
      case "files:list":
        reply({ type: "files:list", files: Object.keys(files).map((name) => ({ name, size: files[name].length })) });
        break;
      case "files:read":
        reply({ type: "files:content", name: msg.name, content: files[msg.name], error: msg.name in files ? undefined : "File not found" });
        break;
      case "files:write": files[msg.name] = msg.content; reply({ type: "files:saved", name: msg.name }); break;
      case "startup:get": reply({ type: "startup:settings", settings }); break;
      case "startup:set": settings = { ...settings, ...msg.settings }; reply({ type: "startup:saved", settings }); break;
    }
  }

  return { send, close: clear };
}
