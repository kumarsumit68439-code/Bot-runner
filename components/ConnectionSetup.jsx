"use client";

import { ChevronDown, Plug, PlugZap, Trash2 } from "lucide-react";
import { useState } from "react";

function statusInfo(connection, sync, gaveUp, enabled, hasSaved) {
  if (!enabled && hasSaved) return ["bg-zinc-500", "Disconnected"];
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

export default function ConnectionSetup({ saved, connection, sync, gaveUp, enabled, onSave, onDisconnect, onClear }) {
  const [open, setOpen] = useState(false);
  const hasSaved = Boolean(saved.tunnelUrl && saved.authToken);
  const [dot, label] = statusInfo(connection, sync, gaveUp, enabled, hasSaved);

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Plug size={18} className="text-brand" />
        <span className="text-sm font-semibold text-white">Connection</span>
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-zinc-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
          <button
            type="button"
            onClick={() => onSave({})}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80"
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
              if (confirm("Clear saved connection data from this browser?")) onClear();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
          >
            <Trash2 size={15} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}
