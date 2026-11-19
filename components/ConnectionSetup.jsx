"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Eye, EyeOff, Plug, PlugZap, ShieldCheck, Trash2 } from "lucide-react";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";
const TEXTAREA = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand min-h-[100px] resize-y";

function statusInfo(connection, sync, gaveUp, enabled, hasSaved) {
  if (!enabled && hasSaved) return ["bg-zinc-500", "Disconnected (manual) - press Save & Connect to reconnect"];
  if (connection === "unconfigured") return ["bg-zinc-500", "Not configured — set tunnel in Admin"];
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
  const [open, setOpen] = useState(true);
  const [reveal, setReveal] = useState({});
  const [error, setError] = useState(null);
  const hasSaved = Boolean(saved.tunnelUrl && saved.authToken);
  const [dot, label] = statusInfo(connection, sync, gaveUp, enabled, hasSaved);

  useEffect(() => { setForm(saved); }, [saved]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const submit = (e) => {
    e.preventDefault();
    if (!saved.tunnelUrl) {
      setError("Tunnel / Railway URL missing — open Admin tab and set it first.");
      return;
    }
    setError(null);
    onSave({
      botToken: form.botToken.trim(),
      clientId: form.clientId.trim(),
      youtubeApiKey: (form.youtubeApiKey || "").trim(),
      youtubeCookies: (form.youtubeCookies || "").trim(),
      authToken: form.authToken?.trim() || saved.authToken,
    });
  };

  const half = Boolean(form.botToken.trim()) !== Boolean(form.clientId.trim());
  const oddId = form.clientId.trim() && !/^\d{17,20}$/.test(form.clientId.trim());

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Plug size={18} className="text-brand" />
        <span className="text-sm font-semibold text-white">Connection & Bot Setup</span>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-zinc-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <form onSubmit={submit} className="space-y-4 border-t border-line p-4">
          <p className="text-xs text-zinc-500">
            Host URLs (Termux tunnel / Railway) are only in <span className="text-zinc-300">Admin</span>. Here: bot credentials + status.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Discord Bot Token"
              secret
              revealed={reveal.bot}
              onToggle={() => toggle("bot")}
              value={form.botToken || ""}
              onChange={(e) => set("botToken", e.target.value)}
              placeholder="Bot token"
            />
            <Field
              label="Discord Client ID"
              value={form.clientId || ""}
              onChange={(e) => set("clientId", e.target.value)}
              placeholder="Application ID"
              hint={oddId ? "Client ID should be 17–20 digits" : half ? "Fill both Bot Token and Client ID" : null}
            />
            <Field
              label="YouTube API Key (optional)"
              secret
              revealed={reveal.yt}
              onToggle={() => toggle("yt")}
              value={form.youtubeApiKey || ""}
              onChange={(e) => set("youtubeApiKey", e.target.value)}
            />
            <label className="block space-y-1.5 text-sm text-zinc-400 md:col-span-2">
              YouTube cookies.txt (optional)
              <textarea
                className={TEXTAREA}
                value={form.youtubeCookies || ""}
                onChange={(e) => set("youtubeCookies", e.target.value)}
                placeholder="Paste cookies.txt contents for age-restricted / better streams"
              />
            </label>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80">
              <Plug size={15} /> Save & Connect
            </button>
            <button type="button" onClick={onDisconnect} disabled={!enabled} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">
              <PlugZap size={15} /> Disconnect
            </button>
            <button type="button" onClick={() => { if (confirm("Remove all saved connection data from this browser?")) onClear(); }} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">
              <Trash2 size={15} /> Clear saved data
            </button>
          </div>

          <p className="flex items-start gap-2 text-xs text-zinc-500">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Values stay in this browser. Tunnel URL is managed only in Admin so visitors cannot see it.
          </p>
        </form>
      )}
    </div>
  );
}
