"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, Plug, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { parseTunnelInput, resolveConnection } from "@/lib/connectionConfig";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";
const TEXTAREA = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand min-h-[100px] resize-y";

function statusInfo(connection, sync, gaveUp, enabled, hasSaved) {
  if (!enabled && hasSaved) return ["bg-zinc-500", "Disconnected (manual) - press Save & Connect to reconnect"];
  if (connection === "unconfigured") return ["bg-zinc-500", "Not configured"];
  if (connection === "connecting") return ["bg-amber-400 animate-pulse", "Connecting..."];
  if (connection === "closed") {
    return ["bg-rose-500", gaveUp ? "Disconnected - could not connect (see the message below)" : "Disconnected - retrying..."];
  }
  if (sync.state === "syncing") return ["bg-amber-400 animate-pulse", "Connected - syncing credentials..."];
  if (sync.state === "synced") return ["bg-emerald-400", "Connected & Credentials Synced"];
  if (sync.state === "error") return ["bg-rose-500", `Connected - credential sync failed: ${sync.error}`];
  return ["bg-emerald-400", "Connected"];
}

function Field({ label, hint, secret, revealed, onToggle, ...props }) {
  return (
    <label className="block space-y-1.5 text-sm text-zinc-400">
      {label}
      <div className="relative">
        <input
          {...props}
          type={secret && !revealed ? "password" : "text"}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={`${INPUT} ${secret ? "pr-10" : ""}`}
        />
        {secret && (
          <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" title="Show / hide">
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <span className="block text-xs text-amber-400">{hint}</span>}
    </label>
  );
}

export default function ConnectionSetup({ saved, connection, sync, gaveUp, enabled, onSave, onDisconnect, onClear }) {
  const [form, setForm] = useState(saved);
  const [open, setOpen] = useState(!saved.tunnelUrl || !saved.authToken);
  const [reveal, setReveal] = useState({});
  const [error, setError] = useState(null);
  const hasSaved = Boolean(saved.tunnelUrl && saved.authToken);
  const [dot, label] = statusInfo(connection, sync, gaveUp, enabled, hasSaved);
  const resolved = useMemo(() => resolveConnection(form.tunnelUrl, form.authToken), [form.tunnelUrl, form.authToken]);

  useEffect(() => { setForm(saved); }, [saved]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const onPasteUrl = (e) => {
    const text = e.clipboardData.getData("text");
    const p = parseTunnelInput(text);
    if (p.empty || p.error || text.trim() === p.base) return;
    e.preventDefault();
    setForm((f) => ({ ...f, tunnelUrl: p.base, authToken: f.authToken.trim() ? f.authToken : p.urlToken }));
  };
  const onBlurUrl = () => {
    const p = parseTunnelInput(form.tunnelUrl);
    if (p.empty || p.error) return;
    setForm((f) => ({ ...f, tunnelUrl: p.base, authToken: f.authToken.trim() ? f.authToken : p.urlToken }));
  };

  const submit = (e) => {
    e.preventDefault();
    const r = resolveConnection(form.tunnelUrl, form.authToken);
    if (r.status !== "ready") return setError(r.message);
    setError(null);
    onSave({
      tunnelUrl: r.base,
      authToken: r.token,
      botToken: form.botToken.trim(),
      clientId: form.clientId.trim(),
      youtubeApiKey: (form.youtubeApiKey || "").trim(),
      youtubeCookies: (form.youtubeCookies || "").trim(),
    });
  };

  const half = Boolean(form.botToken.trim()) !== Boolean(form.clientId.trim());
  const oddId = form.clientId.trim() && !/^\d{17,20}$/.test(form.clientId.trim());
  const insecure = resolved.status === "ready" && resolved.base.startsWith("ws:") && typeof window !== "undefined" && window.location.protocol === "https:";

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Plug size={18} className="text-brand" />
        <span className="text-sm font-semibold text-white">Connection &amp; Bot Setup</span>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-zinc-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form onSubmit={submit} className="space-y-4 border-t border-line p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Cloudflare Tunnel URL"
              placeholder="https://abc-def.trycloudflare.com"
              value={form.tunnelUrl}
              onChange={(e) => set("tunnelUrl", e.target.value)}
              onPaste={onPasteUrl}
              onBlur={onBlurUrl}
            />
            <Field
              label="Backend Auth Token (AUTH_TOKEN)"
              secret
              revealed={reveal.auth}
              onToggle={() => toggle("auth")}
              value={form.authToken}
              onChange={(e) => set("authToken", e.target.value)}
            />
            <Field
              label="Discord Bot Token"
              secret
              revealed={reveal.bot}
              onToggle={() => toggle("bot")}
              value={form.botToken}
              onChange={(e) => set("botToken", e.target.value)}
              hint={half ? "Fill both Bot Token and Client ID to sync credentials to the bot." : null}
            />
            <Field
              label="Discord Client ID"
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
              hint={oddId ? "A Discord Client ID is usually 17-20 digits." : null}
            />
          </div>

          <div className="space-y-4 rounded-lg border border-line bg-[#07090d] p-3">
            <p className="text-xs font-medium text-zinc-300">Music Bot (optional) — YouTube search &amp; anti-bot cookies</p>
            <Field
              label="YouTube Data API v3 Key"
              secret
              revealed={reveal.yt}
              onToggle={() => toggle("yt")}
              value={form.youtubeApiKey || ""}
              onChange={(e) => set("youtubeApiKey", e.target.value)}
              placeholder="AIza..."
              hint="Used for fast song search without rate limits. Get key from Google Cloud Console."
            />
            <label className="block space-y-1.5 text-sm text-zinc-400">
              YouTube Cookies (optional)
              <textarea
                className={TEXTAREA}
                value={form.youtubeCookies || ""}
                onChange={(e) => set("youtubeCookies", e.target.value)}
                placeholder="Paste exported YouTube cookies here (Netscape or browser export) to avoid Sign-in / bot checks"
                spellCheck={false}
                autoComplete="off"
              />
              <span className="block text-xs text-zinc-500">Saved to cookies.txt on the bot. Helps play-dl / yt-dlp pass age/bot walls.</span>
            </label>
          </div>

          <div className="rounded-lg border border-line bg-[#07090d] px-3 py-2 text-xs">
            <p className="text-zinc-500">Final WebSocket URL (token masked)</p>
            {resolved.status === "ready" ? (
              <p className="mt-1 break-all font-mono text-emerald-300">{resolved.maskedUrl}</p>
            ) : (
              <p className={`mt-1 ${resolved.status === "empty" ? "text-zinc-600" : "text-rose-400"}`}>{resolved.message}</p>
            )}
            {resolved.tokenFromUrl && <p className="mt-1 text-zinc-400">The Auth Token was taken from the pasted URL.</p>}
            {resolved.urlTokenIgnored && <p className="mt-1 text-amber-400">The ?token= inside the pasted URL is ignored because the Auth Token field is filled.</p>}
            {insecure && <p className="mt-1 text-amber-400">ws:// is blocked by browsers on https pages. Use the https:// or wss:// tunnel URL.</p>}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80">
              <Plug size={15} /> Save &amp; Connect
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={!enabled}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PlugZap size={15} /> Disconnect
            </button>
            <button
              type="button"
              onClick={() => { if (confirm("Remove all saved connection data from this browser?")) onClear(); }}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              <Trash2 size={15} /> Clear saved data
            </button>
          </div>

          <p className="flex items-start gap-2 text-xs text-zinc-500">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            These values are stored only in this browser (localStorage) and sent only to your own daemon over wss://. The bot credentials are written to bot-credentials.json on your phone, and the bot restarts whenever they change. Anyone with access to this browser profile can read them.
          </p>
        </form>
      )}
    </div>
  );
}
