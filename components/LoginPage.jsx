"use client";

import { Bot, LogIn } from "lucide-react";

const ERRORS = {
  not_admin: "Your Discord account is not on the admin allow-list.",
  oauth_not_configured: "OAuth not configured. Set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET on Vercel.",
  token_exchange: "Discord token exchange failed. Check Client Secret and Callback URL.",
  user_fetch: "Could not load Discord profile.",
  missing_code: "Login was cancelled or no code returned.",
  access_denied: "You denied the Discord authorization.",
  server: "Server error during login.",
};

export default function LoginPage({ error }) {
  const msg = error ? ERRORS[error] || `Login error: ${error}` : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070a] p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand shadow-lg shadow-brand/30">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">BotHost Panel</h1>
            <p className="text-sm text-zinc-500">Admin login required</p>
          </div>
        </div>

        <p className="mb-6 text-sm text-zinc-400">
          Sign in with Discord to open the control panel. Only allowed Discord accounts can access tunnels, tokens, and bot controls.
        </p>

        {msg && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {msg}
          </p>
        )}

        <a
          href="/api/auth/discord?force=1"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752C4]"
        >
          <LogIn size={18} />
          Login with Discord
        </a>

        <p className="mt-6 text-xs leading-relaxed text-zinc-600">
          Discord Developer Portal → OAuth2 → Redirects must include your callback URL (see setup notes after deploy).
        </p>
      </div>
    </div>
  );
}
