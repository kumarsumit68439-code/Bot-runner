"use client";

import { Cloud, Server } from "lucide-react";

export const HOST_MODES = [
  {
    id: "cloudflare",
    title: "Termux + Cloudflare Tunnel",
    short: "Phone / VPS",
    icon: Cloud,
    blurb: "Daemon on Termux or VPS. Cloudflare quick-tunnel public wss:// URL (setup.sh).",
    urlLabel: "Cloudflare Tunnel URL",
    urlPlaceholder: "https://abc-def.trycloudflare.com",
    urlHint: "From setup.sh / pm2 logs tunnel. https:// becomes wss:// automatically.",
  },
  {
    id: "railway",
    title: "Railway Hosting",
    short: "Railway",
    icon: Server,
    blurb: "Daemon on Railway (always online). Use Railway public HTTPS URL — no phone tunnel.",
    urlLabel: "Railway Public URL",
    urlPlaceholder: "https://your-app.up.railway.app",
    urlHint: "Railway → service → Settings → Networking → public domain.",
  },
];

export default function HostModeCards({ mode, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-zinc-400">Hosting mode (both supported — pick one to connect)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {HOST_MODES.map((m) => {
          const Icon = m.icon;
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                on ? "border-brand/50 bg-brand/10" : "border-line bg-[#07090d] hover:bg-white/5"
              }`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${on ? "text-brand" : "text-zinc-500"}`} />
              <span>
                <span className="block text-sm font-medium text-white">{m.title}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{m.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
