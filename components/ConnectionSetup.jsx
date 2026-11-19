"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Eye, EyeOff, Plug, PlugZap, Save, Trash2 } from "lucide-react";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

function statusInfo(connection, sync, gaveUp, enabled, hasHost, hasBot) {
  if (!hasHost) return ["bg-zinc-500", "Waiting for host (admin)"];
  if (!hasBot) return ["bg-amber-400", "Add your bot token"];
  if (!enabled) return ["bg-zinc-500", "Disconnected"];
  if (connection === "unconfigured") return ["bg-zinc-500", "Not configured"];
  if (connection === "connecting") return ["bg-amber-400 animate-pulse", "Connecting..."];
  if (connection === "closed") {
    return ["bg-rose-500", gaveUp ? "Disconnected" : "Disconnected - retrying..."];
  }
  if (sync.state === "syncing") return ["bg-amber-400 animate-pulse", "Syncing..."];
  if (sync.state === "synced") return ["bg-emerald-400", "Connected"];
  if (sync.state === "error") return ["bg-rose-500", "Connected - sync error"];
  return ["bg-emerald-400", "Connected"];
}

/**
 * Shared tunnel comes from admin (hidden from users).
 * Each user only enters their own Bot Token + Client ID (private).
 */
export default function ConnectionSetup({
  saved,
  connection,
  sync,
  gaveUp,
  enabled,
  onSave,
  onDisconnect,
  onClear,
  isAdmin,
  sharedHostConfigured,
}) {
  const [open, setOpen] = useState(true);
  const [botToken, setBotToken] = useState(saved.botToken || "");
  const [clientId, setClientId] = useState(saved.clientId || "");
  const [reveal, setReveal] = useState(false);
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBotToken(saved.botToken || "");
    setClientId(saved.clientId || "");
  }, [saved.botToken, saved.clientId]);

  const hasHost = Boolean(saved.tunnelUrl && saved.authToken) || Boolean(sharedHostConfigured);
  const hasBot = Boolean((botToken || saved.botToken || "").trim());
  const [dot, label] = statusInfo(connection, sync, gaveUp, enabled, hasHost, hasBot);

  const saveBot = async (e) => {
    e?.preventDefault?.();
    setNote(null);
    const t = botToken.trim();
    const c = clientId.trim();
    if (!t) {
      setNote({ ok: false, text: "Bot token required." });
      return;
    }
    setSaving(true);
    try {
      // Private vault (per Discord user) — never overwrites admin secrets
      await fetch("/api/user-bot", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: t, clientId: c }),
      }).catch(() => {});
      onSave({ botToken: t, clientId: c });
      setNote({ ok: true, text: "Your bot credentials saved (private). Host stays shared & hidden." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Plug size={18} className="text-brand" />
        <span className="text-sm font-semibold text-white">Connection & Bot</span>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-zinc-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <p className="text-xs text-zinc-500">
            {isAdmin
              ? "Shared tunnel is set in Admin. Yahan sirf apna bot token (private). Users never see tunnel URL or your tokens."
              : "Host is connected by admin (URL hidden). Sirf apna Discord Bot Token + Client ID daalo — dusre users / admin ke tokens yahan nahi dikhte."}
          </p>

          {!hasHost && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Shared host not ready yet. Admin must save Tunnel / Railway URL in Admin panel first.
            </p>
          )}

          <form onSubmit={saveBot} className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-sm text-zinc-400">
              Your Discord Bot Token
              <div className="relative">
                <input
                  className={`${INPUT} pr-10`}
                  type={reveal ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Bot token (private to you)"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="block space-y-1.5 text-sm text-zinc-400">
              Your Discord Client ID
              <input
                className={INPUT}
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Application ID"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-50"
              >
                <Save size={15} /> {saving ? "Saving…" : "Save & Connect"}
              </button>
              <button
                type="button"
                onClick={() => onSave({})}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
              >
                <Plug size={15} /> Reconnect
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
                onClick={() => {
                  if (confirm("Clear only YOUR bot credentials from this browser?")) onClear();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
              >
                <Trash2 size={15} /> Clear my bot
              </button>
            </div>
          </form>

          {note && (
            <p className={`text-xs ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>
          )}

          {/* Tunnel URL only for admin */}
          {isAdmin && saved.tunnelUrl && (
            <p className="text-[11px] text-zinc-600 font-mono truncate">
              Admin host: {String(saved.tunnelUrl).replace(/^wss?:\/\//, "")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
