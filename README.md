# BotHost Panel

Dark Discord bot hosting panel: Next.js (App Router) + Tailwind + Lucide + xterm.js.
Everything is real: the panel talks to the daemon in `backend/`, which spawns and controls your actual bot process.

- Frontend: repo root (deploy to Vercel)
- Backend daemon: `backend/` (runs on your phone/VPS, see below)

## Deploy the frontend
Import this repo in Vercel (framework auto-detected, Root Directory = repo root). No env vars are required.

## Connect the panel to your daemon
Open the site and fill in the **Connection & Bot Setup** card:
1. Cloudflare Tunnel URL (`https://` is converted to `wss://` automatically)
2. Backend Auth Token (`AUTH_TOKEN` from `backend/.env`)
3. Discord Bot Token and 4. Discord Client ID (optional; synced to the bot)

Press **Save & Connect**. Values are stored in your browser's localStorage and reused on reload, so a new
quick-tunnel URL never needs a Vercel redeploy. When Bot Token and Client ID are set, the panel writes
`bot-credentials.json` into the daemon's `bot/` folder and restarts the bot (only when they changed or when you press Save & Connect).
`NEXT_PUBLIC_WS_URL` still works as an optional fallback.

> Vercel can't host WebSocket servers. The daemon in `backend/` must run elsewhere and be reachable over `wss://` (e.g. Cloudflare Tunnel).

## Run the backend
```bash
cd backend
npm install --omit=dev
cp .env.example .env     # set AUTH_TOKEN (16+ chars)
mkdir -p bot && cp bot-template/index.js bot/index.js
cd bot && npm init -y && npm i discord.js dotenv && cd ..
node server.js           # or: pm2 start server.js --name bot-panel
```

## Daemon protocol (JSON over WebSocket)
Client -> daemon: `hello`, `{type:"power",action:"start|stop|restart"}` (aliases `start`/`stop`/`restart`), `{type:"command",data}`,
`files:list` (alias `get_files`), `{type:"files:read",name}`, `{type:"files:write",name,content}` (alias `save_file`), `startup:get`, `{type:"startup:set",settings}`

Daemon -> client: `{type:"console",data}`, `{type:"status",state:"online|offline|starting"}`,
`{type:"stats",cpu,ram,ramLimit,uptime}`, `{type:"files:list",files:[{name,size}]}`,
`{type:"files:content",name,content,error?}`, `{type:"files:saved",name,error?}`,
`{type:"startup:settings",settings}`, `{type:"startup:saved",error?}`

## Security
The Auth Token and bot credentials live in your browser's localStorage, not in the deployed JavaScript, so visitors to the site
cannot read them. Anyone with access to your browser profile can. Set `ALLOWED_ORIGINS` in the backend `.env` to your Vercel domain.
