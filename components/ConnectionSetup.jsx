"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Eye, EyeOff, Plug, ShieldCheck, Trash2 } from "lucide-react";
import { normalizeTunnelUrl } from "@/lib/connectionConfig";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

function statusInfo(connection, sync, gaveUp) {
  if (connection === "unconfigured") return ["bg-zinc-500", "Not configured"];
  if (connection === "connecting") return ["bg-amber-400 animate-pulse", "Connecting..."];
  if (connection === "closed") {
    return ["bg-rose-500", gaveUp ? "Disconnected - could not connect. Check the URL and token, then press Save & Connect" : "Disconnected - retrying..."];
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

export default function ConnectionSetup({ saved, connection, sync, gaveUp, onSave, onClear }) {
  const [form, setForm] = useState(saved);
  const [open, setOpen] = useState(!saved.tunnelUrl || !saved.authToken);
  const [reveal, setReveal] = useState({});
  const [error, setError] = useState(null);
  const [dot, label] = statusInfo(connection, sync, gaveUp);

  useEffect(() => { setForm(saved); }, [saved]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const submit = (e) => {
    e.preventDefault();
    const url = normalizeTunnelUrl(form.tunnelUrl);
    if (!url) return setError("Enter a valid tunnel URL, e.g. https://abc-def.trycloudflare.com");
    if (!form.authToken.trim()) return setError("Backend Auth Token is required");
    setError(null);
    onSave({
      tunnelUrl: url,
      authToken: form.authToken.trim(),
      botToken: form.botToken.trim(),
      clientId: form.clientId.trim(),
    });
  };

  const half = (!!form.botToken.trim()) !== (!!form.clientId.trim());
  const oddId = form.clientId.trim() && !/^\d{17,20}$/.test(form.clientId.trim());

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
              onChange={(e) => set("tunnelUrl", e.target.value.replace(/^https:\/\//i, "wss://"))}
              onBlur={() => { const n = normalizeTunnelUrl(form.tunnelUrl); if (n) set("tunnelUrl", n); }}
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

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80">
              <Plug size={15} /> Save &amp; Connect
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
