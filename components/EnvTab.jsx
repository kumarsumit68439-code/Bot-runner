"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Database, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Trash2, KeyRound } from "lucide-react";
import { KEY_RE, hashEnvItems, isSecretKey, parseEnv, serializeEnv, setAppliedHash } from "@/lib/envFile";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";
const TEXTAREA =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand min-h-[72px] resize-y";

const PRESETS = [
  { key: "BOT_TOKEN", value: "", multiline: false, secret: true },
  { key: "CLIENT_ID", value: "", multiline: false, secret: false },
  { key: "AI_API_KEY", value: "", multiline: false, secret: true },
  { key: "AI_ENDPOINT", value: "", multiline: false, secret: false },
  { key: "AI_MODEL", value: "", multiline: false, secret: false },
  { key: "YOUTUBE_API_KEY", value: "", multiline: false, secret: true },
  { key: "YOUTUBE_COOKIES", value: "", multiline: true, secret: true },
  { key: "CHANNEL_ID", value: "", multiline: false, secret: false },
];

// Run this once in Supabase -> SQL Editor (the table that stores your variables).
const SETUP_SQL = `create table if not exists public.panel_secrets (
  owner_discord_id text not null,
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner_discord_id, key)
);
alter table public.panel_secrets enable row level security;
revoke all on public.panel_secrets from anon, authenticated;`;

let rowSeq = 0;
function newRow(partial = {}) {
  rowSeq += 1;
  return {
    id: `row-${rowSeq}`,
    key: "",
    value: "",
    secret: false,
    multiline: false,
    reveal: false,
    unreadable: false,
    ...partial,
  };
}

export default function EnvTab({ server }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [didInit, setDidInit] = useState(false);
  // Supabase: loading | ready | off (not configured) | error
  const [sb, setSb] = useState({ status: "loading", message: null, count: 0 });
  const [sqlCopied, setSqlCopied] = useState(false);

  const serverRef = useRef(server);
  serverRef.current = server;

  const connected = server?.connection === "open";
  const loadInFlight = useRef(false);
  const autoLoaded = useRef(false);
  const sbInit = useRef(false);
  const gen = useRef(0);

  const rowsFromItems = (items) =>
    items.map((i) =>
      newRow({
        key: i.key,
        value: i.value || "",
        secret: isSecretKey(i.key),
        multiline: String(i.value || "").includes("\n") || i.key === "YOUTUBE_COOKIES",
        unreadable: Boolean(i.unreadable),
      })
    );

  /** Read every saved variable from Supabase (through our server API, which decrypts them). */
  const loadSupabase = async () => {
    setSb((s) => ({ ...s, status: "loading" }));
    try {
      const r = await fetch("/api/secrets?all=1", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Supabase request failed (${r.status})`);
      if (!j.configured) {
        setSb({ status: "off", message: j.message || "Supabase is not configured.", count: 0 });
        return { configured: false, items: [] };
      }
      const items = Array.isArray(j.items) ? j.items : [];
      setSb({ status: "ready", message: null, count: items.length });
      return { configured: true, items };
    } catch (e) {
      setSb({ status: "error", message: e.message || String(e), count: 0 });
      return null;
    }
  };

  // First thing: load what is saved in Supabase (works even when the daemon is offline).
  useEffect(() => {
    if (sbInit.current) return;
    sbInit.current = true;
    (async () => {
      const res = await loadSupabase();
      if (res?.configured && res.items.length) {
        setRows(rowsFromItems(res.items));
        setNote({ ok: true, text: `Loaded ${res.items.length} saved variable(s) from Supabase.` });
      }
      setDidInit(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadSupabase = async () => {
    setError(null);
    const res = await loadSupabase();
    if (res?.configured) {
      setRows(rowsFromItems(res.items));
      setNote({ ok: true, text: `Loaded ${res.items.length} saved variable(s) from Supabase.` });
    }
  };

  const loadFromBot = async (manual) => {
    const s = serverRef.current;
    if (!s?.request) {
      if (manual) setError("Not connected to the daemon.");
      return;
    }
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const myGen = ++gen.current;
    if (manual) {
      setLoading(true);
      setError(null);
    }
    try {
      let content = "";
      try {
        const res = await s.request({ type: "files:read", name: ".env" }, "files:content", 10000);
        if (myGen !== gen.current) return;
        content = typeof res.content === "string" ? res.content : "";
      } catch {
        if (myGen !== gen.current) return;
        content = "";
      }
      const parsed = parseEnv(content);
      setRows(parsed);
      setDidInit(true);
      if (manual) {
        setNote({
          ok: true,
          text: parsed.length
            ? `Imported ${parsed.length} variable(s) from bot/.env. Press Save to store them in Supabase.`
            : "No .env on the bot yet. Add variables or use Quick-add, then Save.",
        });
      } else if (parsed.length) {
        setNote({ ok: true, text: `Loaded ${parsed.length} variable(s) from bot/.env. Press Save to store them in Supabase.` });
      }
    } catch (e) {
      if (myGen !== gen.current) return;
      if (manual) setError(e.message || String(e));
      setDidInit(true);
    } finally {
      if (myGen === gen.current) {
        loadInFlight.current = false;
        setLoading(false);
      }
    }
  };

  // Fallback: when Supabase has nothing (or is not set up), prefill from the daemon's .env, once.
  useEffect(() => {
    if (!connected || sb.status === "loading") return;
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    if (sb.status === "ready" && sb.count > 0) return; // Supabase is the source of truth
    loadFromBot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, sb.status, sb.count]);

  const updateRow = (id, patch) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id) => setRows((list) => list.filter((r) => r.id !== id));

  const addEmpty = () => {
    setRows((list) => [...list, newRow()]);
  };

  const quickAdd = (preset) => {
    setRows((list) => {
      if (list.some((r) => r.key === preset.key)) return list;
      return [
        ...list,
        newRow({
          key: preset.key,
          value: preset.value || "",
          secret: preset.secret ?? isSecretKey(preset.key),
          multiline: !!preset.multiline,
        }),
      ];
    });
  };

  const save = async () => {
    const s = serverRef.current;
    const keys = new Set();
    for (const r of rows) {
      const k = String(r.key || "").trim();
      if (!k) continue;
      if (!KEY_RE.test(k)) {
        setError(`Invalid key "${k}". Use letters, numbers, underscore; must start with a letter or _.`);
        return;
      }
      if (keys.has(k)) {
        setError(`Duplicate key: ${k}`);
        return;
      }
      keys.add(k);
    }
    if (rows.some((r) => r.unreadable)) {
      setError(
        "Some saved values could not be decrypted (the encryption key changed). Re-type those values, then save."
      );
      return;
    }
    const items = rows
      .map((r) => ({ key: String(r.key || "").trim(), value: r.value == null ? "" : String(r.value) }))
      .filter((i) => i.key);
    const useSb = sb.status === "ready";
    if (!useSb && !connected) {
      setError("Supabase is not available and the daemon is not connected, so there is nowhere to save.");
      return;
    }
    if (useSb && !items.length && sb.count > 0 && !window.confirm("This deletes ALL saved variables from Supabase. Continue?")) {
      return;
    }

    setSaving(true);
    setError(null);
    setNote(null);
    let savedSb = false;
    try {
      if (useSb) {
        const r = await fetch("/api/secrets", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Supabase save failed (${r.status})`);
        savedSb = true;
        setSb({ status: "ready", message: null, count: items.length });
      }
      if (connected && s?.request) {
        await s.request({ type: "files:write", name: ".env", content: serializeEnv(rows) }, "files:saved", 12000);
        s.send({ type: "power:restart" });
        if (useSb) setAppliedHash(hashEnvItems(items));
        setNote({
          ok: true,
          text: useSb
            ? "Saved to Supabase and bot/.env, and restarted the bot."
            : "Saved bot/.env and restarted the bot. Supabase is not available, so nothing was stored there.",
        });
      } else {
        setNote({
          ok: true,
          text: "Saved to Supabase. It will be applied to the bot automatically the next time the daemon connects.",
        });
      }
    } catch (e) {
      const msg = e.message || String(e);
      setError(savedSb ? `Saved to Supabase, but writing bot/.env failed: ${msg}` : msg);
    }
    setSaving(false);
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch {}
  };

  const needsTable = sb.status === "error" && /panel_secrets table/i.test(sb.message || "");
  const canSave = !saving && sb.status !== "loading" && sb.status !== "error" && (sb.status === "ready" || connected);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Environment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Bot token, Client ID, API keys, cookies and any custom variables. They are saved (encrypted) in Supabase, so
          you type them once. Whenever the bot server restarts or is redeployed, they are put back into{" "}
          <code className="text-zinc-300">bot/.env</code> automatically.
        </p>
      </div>

      <div
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
          sb.status === "ready"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : sb.status === "loading"
            ? "border-line bg-panel text-zinc-400"
            : "border-amber-500/30 bg-amber-500/10 text-amber-200"
        }`}
      >
        <Database size={14} className="mt-0.5 shrink-0" />
        <span>
          {sb.status === "loading" && "Checking Supabase..."}
          {sb.status === "ready" &&
            `Supabase connected. ${sb.count} variable(s) saved. Values are encrypted before they are stored.`}
          {sb.status === "off" && `${sb.message} Until then, variables are only written to the bot's .env.`}
          {sb.status === "error" && sb.message}
        </span>
        {(sb.status === "ready" || sb.status === "error" || sb.status === "off") && (
          <button type="button" onClick={reloadSupabase} className="ml-auto shrink-0 underline decoration-dotted">
            Retry
          </button>
        )}
      </div>

      {needsTable && (
        <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
          <p className="text-sm text-zinc-300">
            One-time setup: open Supabase, go to <b>SQL Editor</b>, paste this and press Run. Then press Retry above.
          </p>
          <pre className="overflow-x-auto rounded-md bg-[#07090d] p-3 text-xs text-zinc-300">{SETUP_SQL}</pre>
          <button
            type="button"
            onClick={copySql}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/5"
          >
            <Copy size={13} /> {sqlCopied ? "Copied" : "Copy SQL"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Quick-add:</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => quickAdd(p)}
            className="rounded-full border border-line bg-panel px-2.5 py-1 font-mono text-xs text-zinc-300 hover:border-brand/50 hover:text-white"
          >
            {p.key}
          </button>
        ))}
      </div>

      <div className="min-h-[120px] space-y-3">
        {!didInit && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Loading saved variables…
          </p>
        )}
        {didInit && rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-zinc-500">
            No variables yet. Use Quick-add or Add variable.
          </p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-line bg-panel p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${INPUT} max-w-[200px] sm:max-w-[240px]`}
                placeholder="KEY"
                value={row.key}
                onChange={(e) =>
                  updateRow(row.id, {
                    key: e.target.value.replace(/\s+/g, "_").toUpperCase(),
                    secret: isSecretKey(e.target.value),
                    multiline: e.target.value.toUpperCase() === "YOUTUBE_COOKIES" || row.multiline,
                  })
                }
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => updateRow(row.id, { reveal: !row.reveal })}
                className="rounded-lg border border-line p-2 text-zinc-400 hover:text-white"
                title="Show / hide value"
              >
                {row.reveal ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                onClick={() => updateRow(row.id, { multiline: !row.multiline })}
                className="rounded-lg border border-line px-2 py-1 text-xs text-zinc-400 hover:text-white"
                title="Toggle multiline"
              >
                {row.multiline ? "Multiline" : "Single"}
              </button>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="ml-auto rounded-lg border border-line p-2 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {row.unreadable && (
              <p className="text-xs text-amber-400">
                This saved value cannot be decrypted with the current encryption key. Type the value again.
              </p>
            )}
            {row.multiline ? (
              <textarea
                className={TEXTAREA}
                placeholder="VALUE"
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value, unreadable: false })}
                spellCheck={false}
                autoComplete="off"
              />
            ) : (
              <input
                className={INPUT}
                type={row.secret && !row.reveal ? "password" : "text"}
                placeholder="VALUE"
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value, unreadable: false })}
                spellCheck={false}
                autoComplete="off"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {note && <p className={`text-sm ${note.ok ? "text-emerald-400" : "text-amber-400"}`}>{note.text}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addEmpty}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
        >
          <Plus size={15} /> Add variable
        </button>
        <button
          type="button"
          onClick={reloadSupabase}
          disabled={sb.status === "loading" || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
        >
          {sb.status === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />} Reload from Supabase
        </button>
        <button
          type="button"
          onClick={() => loadFromBot(true)}
          disabled={!connected || loading || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Import from bot
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save & Restart Bot
        </button>
      </div>

      {!connected && (
        <p className="flex items-start gap-2 text-xs text-amber-400">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          The daemon is not connected. You can still save to Supabase; the bot gets the values when it connects.
        </p>
      )}
    </div>
  );
}
