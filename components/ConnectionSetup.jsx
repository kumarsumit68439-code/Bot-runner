"use client";

import { ChevronDown, Eye, EyeOff, Plug, PlugZap, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

function statusInfo(connection, sync, gaveUp, enabled, hasHost, hasBot) {
  if (!hasHost) return ["bg-amber-400", "Waiting for admin host"];
  if (!hasBot) return ["bg-zinc-500", "Add bot token"];
  if (!enabled && hasHost) return ["bg-zinc-500", "Disconnected"];
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
 * Users: only Bot Token + Client ID (shared tunnel is injected from admin, never shown).
 * Admin can still reconnect/clear; tunnel is managed in Admin panel.
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

  useEffect(() => {
    setBotToken(saved.botToken || "");
    setClientId(saved.clientId || "");
  }, [saved.botToken, saved.clientId]);

  const hasHost = Boolean(saved.tunnelUrl && saved.authToken) || Boolean(sharedHostConfigured);
  const hasBot = Boolean((botToken || saved.botToken || "").trim());
  const [dot, label] = statusInfo(connection, sync, gaveUp, enabled, hasHost, hasBot);

  const saveBot = (e) => {
    e?.preventDefault?.();
    setNote(null);
    const t = botToken.trim();
    const c = clientId.trim();
    if (!t) {
      setNote({ ok: false, text: "Bot token required." });
      return;
    }
    onSave({ botToken: t, clientId: c });
    setNote({ ok: true, text: "Bot credentials saved. Connecting with shared host…" });
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
              ? "Shared daemon URL is set in Admin panel. Yahan apna bot token daalo (optional for admin)."
              : "Host (Termux / Railway tunnel) admin ne set kiya hai — URL aapko nahi dikhega. Sirf apna Discord Bot Token + Client ID daalo, bot online ho jayega."}
          </p>

          {!hasHost && !isAdmin && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Admin ne abhi shared tunnel URL set nahi kiya. Admin panel se Cloudflare / Railway URL save hone ke baad yahan connect hoga.
            </p>
          )}

          <form onSubmit={saveBot} className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5 text-sm text-zinc-400">
              Discord Bot Token
              <div className="relative">
                <input
                  className={`${INPUT} pr-10`}
                  type={reveal ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Bot token (Developer Portal)"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="block space-y-1.5 text-sm text-zinc-400">
              Discord Client ID
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
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80"
              >
                <Save size={15} /> Save & Connect
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
                  if (confirm("Clear saved bot credentials from this browser?")) onClear();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
              >
                <Trash2 size={15} /> Clear
              </button>
            </div>
          </form>

          {note && (
            <p className={`text-xs ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>
          )}

          {/* Never show tunnel URL to non-admins */}
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
