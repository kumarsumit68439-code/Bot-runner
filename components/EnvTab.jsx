"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Trash2, KeyRound } from "lucide-react";

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

const SECRET_HINTS = new Set([
  "BOT_TOKEN",
  "DISCORD_TOKEN",
  "TOKEN",
  "AI_API_KEY",
  "API_KEY",
  "YOUTUBE_API_KEY",
  "YOUTUBE_COOKIES",
  "AUTH_TOKEN",
  "PASSWORD",
  "SECRET",
  "COOKIE",
  "COOKIES",
]);

function isSecretKey(key) {
  const k = String(key || "").toUpperCase();
  if (SECRET_HINTS.has(k)) return true;
  return /TOKEN|SECRET|PASSWORD|KEY|COOKIE|AUTH/.test(k);
}

function parseEnv(text) {
  const rows = [];
  if (!text || !String(text).trim()) return rows;
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1);
    if (value.startsWith('"')) {
      let body = value.slice(1);
      if (body.endsWith('"') && !body.slice(0, -1).endsWith("\\")) {
        value = body.slice(0, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      } else {
        const parts = [body];
        while (i < lines.length) {
          const next = lines[i];
          i += 1;
          if (next.endsWith('"') && !next.endsWith('\\"')) {
            parts.push(next.slice(0, -1));
            break;
          }
          parts.push(next);
        }
        value = parts.join("\n").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    rows.push({
      id: `env-${key}-${rows.length}`,
      key,
      value,
      secret: isSecretKey(key),
      multiline: value.includes("\n") || key === "YOUTUBE_COOKIES",
      reveal: false,
    });
  }
  return rows;
}

function serializeEnv(rows) {
  const lines = [
    "# BotHost environment — edited from the panel Environment tab",
    "# Do not commit secrets. Bot loads these via dotenv on start.",
    "",
  ];
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const value = row.value == null ? "" : String(row.value);
    const needsQuote =
      value.includes("\n") ||
      value.includes("#") ||
      value.includes(" ") ||
      value.includes('"') ||
      value.includes("'") ||
      value.startsWith(" ") ||
      value.endsWith(" ");
    if (needsQuote) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

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

  const serverRef = useRef(server);
  serverRef.current = server;

  const connected = server?.connection === "open";
  const loadInFlight = useRef(false);
  const autoLoaded = useRef(false);
  const gen = useRef(0);

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
            ? `Loaded ${parsed.length} variable(s) from bot/.env`
            : "No .env yet — add variables or use Quick-Add, then Save & Restart Bot.",
        });
      } else if (parsed.length) {
        setNote({ ok: true, text: `Loaded ${parsed.length} variable(s) from bot/.env` });
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

  // Auto-load at most ONCE while this tab is mounted. Never re-trigger on reconnect flicker.
  useEffect(() => {
    if (!connected) return;
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    loadFromBot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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
    if (!s?.request) {
      setError("Not connected to the daemon.");
      return;
    }
    const keys = new Set();
    for (const r of rows) {
      const k = String(r.key || "").trim();
      if (!k) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
        setError(`Invalid key "${k}". Use letters, numbers, underscore; must start with a letter or _.`);
        return;
      }
      if (keys.has(k)) {
        setError(`Duplicate key: ${k}`);
        return;
      }
      keys.add(k);
    }
    setSaving(true);
    setError(null);
    const body = serializeEnv(rows);
    try {
      await s.request({ type: "files:write", name: ".env", content: body }, "files:saved", 12000);
      s.send({ type: "power", action: "restart" });
      setNote({ ok: true, text: "Saved bot/.env and restarted the bot." });
    } catch (e) {
      setError(e.message || String(e));
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Environment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Key–value pairs written to <code className="text-zinc-300">bot/.env</code> on your phone. The bot loads them
          with <code className="text-zinc-300">dotenv</code> on start (same idea as Railway / Vercel env vars).
        </p>
      </div>

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
        {!didInit && connected && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 size={14} className="animate-spin" /> Loading .env…
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
            {row.multiline ? (
              <textarea
                className={TEXTAREA}
                placeholder="VALUE"
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
            ) : (
              <input
                className={INPUT}
                type={row.secret && !row.reveal ? "password" : "text"}
                placeholder="VALUE"
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
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
          onClick={() => loadFromBot(true)}
          disabled={!connected || loading || loadInFlight.current}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reload from bot
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!connected || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save & Restart Bot
        </button>
      </div>

      {!connected && (
        <p className="flex items-start gap-2 text-xs text-amber-400">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          Connect the daemon first (Connection & Bot Setup) to read/write <code className="text-zinc-300">.env</code>.
        </p>
      )}
    </div>
  );
}
