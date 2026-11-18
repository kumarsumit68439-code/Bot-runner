# BotHost Panel

Dark Discord bot hosting panel: Next.js (App Router) + Tailwind + Lucide + xterm.js.  
The panel talks to a **daemon** in `backend/`, which spawns and controls your real Discord bot.

- **Frontend:** repo root → deploy to Vercel  
- **Backend daemon:** `backend/` → run on **Termux + Cloudflare Tunnel** *or* **Railway** (both supported)

## Hosting modes (both stay available)

| Mode | Where daemon runs | Public URL | Setup |
|------|-------------------|------------|--------|
| **Termux + Cloudflare Tunnel** | Phone (Termux) or Linux VPS | `https://….trycloudflare.com` (changes on tunnel restart) | `setup.sh` |
| **Railway** | Railway cloud (always on) | `https://….up.railway.app` (stable) | Deploy `backend/` on Railway |

In the panel → **Connection & Bot Setup** → pick **Termux + Cloudflare Tunnel** or **Railway**, paste the public URL + `AUTH_TOKEN`, then **Save & Connect**.

---

## Deploy the frontend (Vercel)

Import this repo in Vercel (Root Directory = repo root). No env vars required.

---

## Option A — Termux + Cloudflare Tunnel (phone / VPS)

One-command setup (native Termux or Ubuntu/Debian):

```bash
curl -fsSL https://raw.githubusercontent.com/kumarsumit68439-code/Bot-runner/main/setup.sh | bash
```

This installs Node, PM2, cloudflared, starts the daemon + quick tunnel, and prints a magic link:

`https://your-panel.vercel.app/#tunnel=https://….trycloudflare.com&token=AUTH_TOKEN`

Manual:

```bash
cd backend
npm install --omit=dev
cp .env.example .env     # AUTH_TOKEN (16+ chars), HOST=127.0.0.1
mkdir -p bot && cp bot-template/index.js bot/index.js
# assemble full bot if using chunks — see backend/bot-template/README_BOT.md
cd bot && npm init -y && npm i discord.js dotenv @discordjs/voice play-dl opusscript && cd ..
node server.js           # or pm2 start server.js --name bot-panel
# separate process: cloudflared tunnel --url http://127.0.0.1:8080
```

---

## Option B — Railway Hosting

1. Create a project on [Railway](https://railway.app) → **New** → **GitHub repo** → this repo.  
2. **Root Directory:** `backend`  
3. **Variables** (Railway → Variables):

| Variable | Value |
|----------|--------|
| `AUTH_TOKEN` | long random string (16+ chars) |
| `HOST` | `0.0.0.0` (or omit — auto when Railway env is detected) |
| `ALLOWED_ORIGINS` | `https://your-panel.vercel.app` |
| `AUTO_START` | `true` (optional) |

Railway sets `PORT` automatically.  
4. Generate a **public domain** (Settings → Networking).  
5. In the panel, choose **Railway Hosting**, paste:

- Railway Public URL: `https://your-service.up.railway.app`  
- Auth Token: same as `AUTH_TOKEN`  
- Discord Bot Token + Client ID  

6. **Save & Connect** — same console, power, files, env, modules as Termux mode.

`backend/railway.toml` and `backend/Dockerfile` are included if you want explicit Nixpacks/Docker builds.

---

## Connect the panel

1. Open the Vercel site → **Connection & Bot Setup**  
2. Select host mode (**Cloudflare** or **Railway**)  
3. Public URL + Auth Token (+ Discord credentials)  
4. **Save & Connect**

Values live in browser `localStorage` only. Bot credentials are written to the daemon’s `bot/bot-credentials.json` when they change.

> Vercel cannot host WebSockets. The daemon must run on Termux/VPS (tunnel) or Railway and be reachable over `wss://`.

---

## Daemon protocol (JSON over WebSocket)

**Client → daemon:** `hello`, `{type:"power",action:"start|stop|restart"}`, `{type:"command",data}`,  
`files:list`, `{type:"files:read",name}`, `{type:"files:write",name,content}`, `startup:get`, `{type:"startup:set",settings}`

**Daemon → client:** `console`, `status`, `stats`, `files:list`, `files:content`, `files:saved`, `startup:settings`, `startup:saved`

---

## Security

Auth token and bot credentials stay in your browser profile, not in the public JS bundle. Restrict `ALLOWED_ORIGINS` to your Vercel domain on the daemon.
