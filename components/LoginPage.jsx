"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";

const ERRORS = {
  not_admin: "Access denied.",
  oauth_not_configured: "Login is not available right now.",
  token_exchange: "Login failed. Try again.",
  user_fetch: "Login failed. Try again.",
  missing_code: "Login was cancelled.",
  access_denied: "Authorization denied.",
  server: "Server error. Try again.",
  captcha_required: "Complete the verification first.",
  captcha_failed: "Verification failed. Try again.",
  captcha_missing_keys: "Verification is not configured.",
};

function DiscordIcon({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function SpotifyIcon({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export default function LoginPage({ error }) {
  const [siteKey, setSiteKey] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  const [token, setToken] = useState(null);
  const [widgetError, setWidgetError] = useState(null);
  const widgetId = useRef(null);
  const containerRef = useRef(null);

  const msg = error ? ERRORS[error] || "Login error. Try again." : null;

  useEffect(() => {
    fetch("/api/auth/turnstile-config")
      .then((r) => r.json())
      .then((j) => {
        setSiteKey(j.siteKey || "");
        setConfigLoaded(true);
        if (!j.siteKey || !j.configured) setWidgetError("missing_keys");
      })
      .catch(() => {
        setConfigLoaded(true);
        setWidgetError("missing_keys");
      });
  }, []);

  useEffect(() => {
    if (!siteKey || !configLoaded) return;
    let cancelled = false;
    function renderWidget() {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetId.current != null) {
        try { window.turnstile.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
      containerRef.current.innerHTML = "";
      try {
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "dark",
          callback: (t) => { setToken(t); setWidgetError(null); },
          "error-callback": () => { setToken(null); setWidgetError("failed"); },
          "expired-callback": () => setToken(null),
          "timeout-callback": () => { setToken(null); setWidgetError("failed"); },
        });
      } catch {
        setWidgetError("failed");
      }
    }
    if (window.turnstile) renderWidget();
    else {
      const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (existing) existing.addEventListener("load", renderWidget);
      else {
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
  }, [siteKey, configLoaded]);

  const canLogin = Boolean(token) && Boolean(siteKey);
  const loginHref = canLogin
    ? `/api/auth/discord?force=1&turnstile=${encodeURIComponent(token)}`
    : undefined;
  const spotifyHref = canLogin
    ? `/api/auth/spotify?turnstile=${encodeURIComponent(token)}`
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070a] p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#5865F2] shadow-lg shadow-[#5865F2]/30">
            <DiscordIcon size={28} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-white">BotHost Panel</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to continue</p>
        </div>

        {msg && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-200">
            {msg}
          </p>
        )}

        <div className="mb-5 rounded-xl border border-line bg-[#07090d] p-4">
          <p className="mb-3 flex items-center justify-center gap-2 text-xs font-medium text-zinc-400">
            <ShieldCheck size={14} className="text-brand" />
            Security check
          </p>
          {!configLoaded && <p className="text-center text-xs text-zinc-500">Loading verification…</p>}
          {configLoaded && !siteKey && (
            <p className="text-center text-xs text-amber-400">Verification is not configured.</p>
          )}
          <div ref={containerRef} className="flex min-h-[65px] justify-center" />
          {widgetError === "failed" && (
            <p className="mt-2 text-center text-xs text-rose-400">Verification failed. Refresh the page.</p>
          )}
          {token && <p className="mt-2 text-center text-xs text-emerald-400">Verified</p>}
        </div>

        <div className="space-y-3">
          {canLogin ? (
            <a
              href={loginHref}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752C4]"
            >
              <DiscordIcon size={20} />
              Continue with Discord
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#5865F2]/40 px-4 py-3 text-sm font-semibold text-white/70"
            >
              <DiscordIcon size={20} />
              {siteKey ? "Complete verification to continue" : configLoaded ? "Unavailable" : "Loading…"}
            </button>
          )}

          {canLogin ? (
            <a
              href={spotifyHref}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-3 text-sm font-semibold text-black hover:bg-[#1ed760]"
            >
              <SpotifyIcon size={20} />
              Continue with Spotify
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#1DB954]/40 px-4 py-3 text-sm font-semibold text-black/50"
            >
              <SpotifyIcon size={20} />
              Continue with Spotify
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600">
          <a href="/privacy" className="hover:text-zinc-400">Privacy</a>
          <a href="/terms" className="hover:text-zinc-400">Terms</a>
          <a href="/license" className="hover:text-zinc-400">License</a>
        </div>
      </div>
    </div>
  );
}
