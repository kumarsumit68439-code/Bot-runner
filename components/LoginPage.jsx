"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, LogIn, ShieldCheck } from "lucide-react";

const ERRORS = {
  not_admin: "Your Discord account is not on the admin allow-list.",
  oauth_not_configured: "OAuth not configured. Set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET on Vercel.",
  token_exchange: "Discord token exchange failed. Check Client Secret and Callback URL.",
  user_fetch: "Could not load Discord profile.",
  missing_code: "Login was cancelled or no code returned.",
  access_denied: "You denied the Discord authorization.",
  server: "Server error during login.",
  captcha_required: "Complete the CAPTCHA verification first.",
  captcha_failed: "CAPTCHA verification failed. Try again.",
  captcha_missing_keys: "Turnstile keys not set on server (NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY).",
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export default function LoginPage({ error }) {
  const [token, setToken] = useState(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState(null);
  const widgetId = useRef(null);
  const containerRef = useRef(null);

  const msg = error ? ERRORS[error] || `Login error: ${error}` : null;

  useEffect(() => {
    if (!SITE_KEY) {
      setWidgetError("missing_keys");
      return;
    }

    let cancelled = false;

    function renderWidget() {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetId.current != null) {
        try { window.turnstile.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
      containerRef.current.innerHTML = "";
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: (t) => {
          setToken(t);
          setWidgetError(null);
        },
        "error-callback": () => {
          setToken(null);
          setWidgetError("failed");
        },
        "expired-callback": () => {
          setToken(null);
        },
        "timeout-callback": () => {
          setToken(null);
          setWidgetError("failed");
        },
      });
      setWidgetReady(true);
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (existing) {
        existing.addEventListener("load", renderWidget);
      } else {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = renderWidget;
        s.onerror = () => setWidgetError("failed");
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
      }
    };
  }, []);

  const canLogin = Boolean(token) && Boolean(SITE_KEY);

  const loginHref = canLogin
    ? `/api/auth/discord?force=1&turnstile=${encodeURIComponent(token)}`
    : undefined;

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
          Complete the security check, then sign in with Discord. Only allowed accounts can open the panel.
        </p>

        {msg && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {msg}
          </p>
        )}

        <div className="mb-4 rounded-xl border border-line bg-[#07090d] p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-400">
            <ShieldCheck size={14} className="text-brand" />
            Cloudflare verification
          </p>
          {!SITE_KEY && (
            <p className="text-xs text-amber-400">
              Set <code className="text-zinc-300">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> and{" "}
              <code className="text-zinc-300">TURNSTILE_SECRET_KEY</code> on Vercel, then redeploy.
            </p>
          )}
          <div ref={containerRef} className="flex min-h-[65px] justify-center" />
          {widgetError === "failed" && (
            <p className="mt-2 text-xs text-rose-400">CAPTCHA failed to load or expired. Refresh the page.</p>
          )}
          {token && (
            <p className="mt-2 text-xs text-emerald-400">Verified — you can continue to Discord login.</p>
          )}
          {SITE_KEY && !token && widgetReady && !widgetError && (
            <p className="mt-2 text-xs text-zinc-500">Waiting for CAPTCHA…</p>
          )}
        </div>

        {canLogin ? (
          <a
            href={loginHref}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752C4]"
          >
            <LogIn size={18} />
            Login with Discord
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#5865F2]/40 px-4 py-3 text-sm font-semibold text-white/70"
          >
            <LogIn size={18} />
            {SITE_KEY ? "Complete CAPTCHA to continue" : "CAPTCHA not configured"}
          </button>
        )}

        <p className="mt-6 text-xs leading-relaxed text-zinc-600">
          Protected by Cloudflare Turnstile. Discord OAuth starts only after a successful CAPTCHA check on the server.
        </p>
      </div>
    </div>
  );
}
