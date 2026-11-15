# BotHost Panel

Dark Discord bot hosting panel: Next.js (App Router) + Tailwind + Lucide + xterm.js.
Everything is real: the panel talks to the daemon in `backend/`, which spawns and controls your actual bot process.

- Frontend: repo root (deploy to Vercel)
- Backend daemon: `backend/` (runs on your phone/VPS, see below)

## Deploy the frontend
1. Import this repo in Vercel (framework auto-detected, Root Directory = repo root).
2. Set the env var `NEXT_PUBLIC_WS_URL=wss://your-tunnel-host/?token=YOUR_AUTH_TOKEN` and redeploy.
   Without it the panel shows "WS URL not set" and all controls stay disabled (there is no demo mode).

> Vercel can't host WebSocket servers. The daemon in `backend/` must run elsewhere and be reachable over `wss://` (e.g. Cloudflare Tunnel).

## Run the backend
```bash
cd backend
npm install --omit=dev
cp .env.example .env     # set AUTH_TOKEN (16+ chars)
mkdir -p bot             # put your bot files here
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
`NEXT_PUBLIC_*` values are visible to anyone who opens the site, so a token placed in `NEXT_PUBLIC_WS_URL` is not secret.
Enable Vercel Deployment Protection and set `ALLOWED_ORIGINS` in the backend `.env`.
