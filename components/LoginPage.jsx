"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Mail, Lock } from "lucide-react";

const ERRORS = {
  not_admin: "Access denied.",
  oauth_not_configured: "OAuth not configured. Check Vercel env vars and redirect URIs.",
  token_exchange: "Token failed. Check Client Secret and Redirect URI.",
  user_fetch: "Could not load profile. Try again.",
  spotify_dev_mode: "Spotify Development mode blocks public login. Use Discord, Google, or Email.",
  missing_code: "Login was cancelled.",
  access_denied: "Authorization denied.",
  server: "Server error during login. Check Vercel logs and env vars.",
  captcha_required: "Complete the verification first.",
  captcha_failed: "Verification failed. Complete the captcha again.",
  captcha_expired: "Captcha expired. Complete the check again, then login.",
  captcha_hostname: "Captcha domain not allowed. In Cloudflare Turnstile add hostname: hostgo.go-live.me",
  captcha_missing_keys: "Verification is not configured.",
  supabase_not_configured: "Supabase Auth not configured. Set SUPABASE_URL + SUPABASE_ANON_KEY on Vercel.",
  invalid_credentials: "Wrong email or password.",
  already_registered: "Email already registered. Log in instead.",
  email_confirm_required: "Confirm your email, then log in.",
  weak_password: "Password must be at least 6 characters.",
  invalid_email: "Enter a valid email.",
  auth_failed: "Login failed. Try again.",
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

function GoogleIcon({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState(null);

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
  const discordHref = canLogin
    ? `/api/auth/discord?force=1&turnstile=${encodeURIComponent(token)}`
    : undefined;
  const spotifyHref = canLogin
    ? `/api/auth/spotify?turnstile=${encodeURIComponent(token)}`
    : undefined;
  const googleHref = canLogin
    ? `/api/auth/google?turnstile=${encodeURIComponent(token)}`
    : undefined;

  async function onEmailSubmit(e) {
    e.preventDefault();
    setFormMsg(null);
    if (!canLogin) {
      setFormMsg(ERRORS.captcha_required);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, email, password, turnstile: token }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.needsConfirm) {
        setFormMsg(j.message || ERRORS.email_confirm_required);
        setMode("login");
        setBusy(false);
        return;
      }
      if (!r.ok || !j.ok) {
        setFormMsg(ERRORS[j.error] || j.message || ERRORS.auth_failed);
        if (String(j.error || "").startsWith("captcha")) {
          setToken(null);
          try {
            if (widgetId.current != null && window.turnstile) {
              window.turnstile.reset(widgetId.current);
            }
          } catch {}
        }
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setFormMsg(ERRORS.server);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070a] p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#5865F2] shadow-lg shadow-[#5865F2]/30">
            <DiscordIcon size={28} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-white">BotHost Panel</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to continue</p>
        </div>

        {(msg || formMsg) && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-200">
            {formMsg || msg}
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

        <form onSubmit={onEmailSubmit} className="mb-4 space-y-3">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => { setMode("login"); setFormMsg(null); }}
              className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "login" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Email login
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setFormMsg(null); }}
              className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "signup" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Sign up
            </button>
          </div>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <Mail size={12} /> Email
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-[#07090d] px-3 py-2.5 text-sm text-white outline-none focus:border-brand"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500">
              <Lock size={12} /> Password
            </span>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-[#07090d] px-3 py-2.5 text-sm text-white outline-none focus:border-brand"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={!canLogin || busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in with Email"}
          </button>
        </form>

        <div className="relative mb-4 text-center">
          <span className="relative z-10 bg-panel px-2 text-xs text-zinc-600">or</span>
          <div className="absolute left-0 right-0 top-1/2 border-t border-line" />
        </div>

        <div className="space-y-3">
          {canLogin ? (
            <a href={googleHref} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              <GoogleIcon size={18} />
              Continue with Google
            </a>
          ) : (
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-line bg-white/40 px-4 py-3 text-sm font-semibold text-zinc-500">
              <GoogleIcon size={18} />
              Continue with Google
            </button>
          )}

          {canLogin ? (
            <a href={discordHref} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752C4]">
              <DiscordIcon size={20} />
              Continue with Discord
            </a>
          ) : (
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#5865F2]/40 px-4 py-3 text-sm font-semibold text-white/70">
              <DiscordIcon size={20} />
              {siteKey ? "Complete verification to continue" : configLoaded ? "Unavailable" : "Loading…"}
            </button>
          )}

          {canLogin ? (
            <a href={spotifyHref} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-3 text-sm font-semibold text-black hover:bg-[#1ed760]">
              <SpotifyIcon size={20} />
              Continue with Spotify
            </a>
          ) : (
            <button type="button" disabled className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#1DB954]/40 px-4 py-3 text-sm font-semibold text-black/50">
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
