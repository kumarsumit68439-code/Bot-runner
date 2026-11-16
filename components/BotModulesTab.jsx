"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
import { AI_PROVIDERS, PROVIDER_ORDER, fetchLiveModels } from "@/lib/aiPresets";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand disabled:opacity-60";

/** 18 modular features — only ON/OFF, zero Channel ID / Role ID inputs */
export const MODULES = [
  { id: "welcome", label: "Welcome Messages", desc: "Greet new members in #welcome (auto-created)" },
  { id: "goodbye", label: "Goodbye Messages", desc: "Say goodbye when members leave" },
  { id: "autorole", label: "Auto Role (Supporter)", desc: "Assign Supporter role on join (auto-created)" },
  { id: "leveling", label: "Leveling / XP", desc: "Message XP + level-ups in #levels" },
  { id: "aichat", label: "AI Chat", desc: "AI replies in #ai-chat (uses AI presets below)" },
  { id: "music", label: "Music", desc: "Basic music commands in #music / General VC" },
  { id: "tickets", label: "Tickets", desc: "Support ticket system in #tickets" },
  { id: "support", label: "Support Channel", desc: "Staff alerts in #support" },
  { id: "modlogs", label: "Mod Logs", desc: "Moderation actions → #mod-logs" },
  { id: "protectlogs", label: "Protect Logs", desc: "Anti-raid / protect events → #protect-logs" },
  { id: "protect", label: "Protect / Auto-Mod", desc: "Anti-spam, invite & link filters" },
  { id: "memberadd", label: "Member Join Log", desc: "Join logs in #member-add" },
  { id: "suggestions", label: "Suggestions", desc: "Suggestion board (react to approve)" },
  { id: "giveaways", label: "Giveaways", desc: "Simple giveaway commands" },
  { id: "reactionroles", label: "Reaction Roles", desc: "React to get roles" },
  { id: "fun", label: "Fun Commands", desc: "8ball, meme, coinflip, etc." },
  { id: "utility", label: "Utility Commands", desc: "ping, serverinfo, userinfo, avatar" },
  { id: "antiraid", label: "Anti-Raid", desc: "Join-rate protection + quarantine" },
];

const DEFAULT_MODULES = Object.fromEntries(MODULES.map((m) => [m.id, m.id === "aichat" || m.id === "utility"]));

function initialAi(saved) {
  const provider = AI_PROVIDERS[saved.aiProvider] ? saved.aiProvider : "groq";
  const preset = AI_PROVIDERS[provider];
  return {
    provider,
    endpoint: saved.aiEndpoint || preset.endpoint,
    model: saved.aiModel || preset.defaultModel,
    apiKey: saved.aiApiKey || "",
  };
}

function loadModules() {
  try {
    const raw = JSON.parse(localStorage.getItem("botpanel.modules.v1") || "{}");
    return { ...DEFAULT_MODULES, ...raw };
  } catch {
    return { ...DEFAULT_MODULES };
  }
}

function saveModulesLocal(mods) {
  try {
    localStorage.setItem("botpanel.modules.v1", JSON.stringify(mods));
  } catch {}
}

export default function BotModulesTab({ saved, connection, sync, onSaveAi, server }) {
  const [mods, setMods] = useState(loadModules);
  const [f, setF] = useState(() => initialAi(saved));
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setF(initialAi(saved));
    setLive(null);
  }, [saved.aiProvider, saved.aiEndpoint, saved.aiModel, saved.aiApiKey]);

  const preset = AI_PROVIDERS[f.provider];
  const isCustom = f.provider === "custom";
  const baseModels = live ?? preset.models;
  const models =
    baseModels.some((m) => m.id === f.model) || !f.model
      ? baseModels
      : [{ id: f.model, label: `${f.model} (current)` }, ...baseModels];

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (id) => setMods((m) => ({ ...m, [id]: !m[id] }));

  const pickProvider = (id) => {
    const p = AI_PROVIDERS[id];
    setF((s) => ({ ...s, provider: id, endpoint: p.endpoint, model: p.defaultModel }));
    setLive(null);
    setNote(null);
    setError(null);
  };

  const refresh = async () => {
    setLoading(true);
    setNote(null);
    try {
      const list = await fetchLiveModels(f.provider, f.endpoint, f.apiKey.trim());
      setLive(list);
      if (!list.some((m) => m.id === f.model)) set("model", list[0].id);
      setNote({ ok: true, text: `Loaded ${list.length} live chat models from ${preset.label}.` });
    } catch (e) {
      setNote({
        ok: false,
        text: `${e.message} Keeping the built-in list.`,
      });
    }
    setLoading(false);
  };

  const saveAndSync = async () => {
    setSaving(true);
    setError(null);
    setNote(null);

    const apiKey = f.apiKey.trim();
    const endpoint = f.endpoint.trim();
    const model = f.model.trim();

    // AI: only API key needed — channel is auto-detected as #ai-chat
    if (mods.aichat && !apiKey) {
      setError("AI Chat is ON: enter an API key, or turn AI Chat off.");
      setSaving(false);
      return;
    }
    if (apiKey && !/^https?:\/\/\S+$/i.test(endpoint)) {
      setError("The endpoint must be a full URL starting with https://");
      setSaving(false);
      return;
    }
    if (apiKey && !model) {
      setError("Choose or enter a model.");
      setSaving(false);
      return;
    }

    // Persist AI (no channel ID)
    onSaveAi({
      aiProvider: f.provider,
      aiEndpoint: endpoint,
      aiModel: model,
      aiApiKey: apiKey,
      aiChannelId: "", // zero-ID: bot auto-finds/creates #ai-chat
    });

    // Persist modules locally
    saveModulesLocal(mods);

    // Write bot-config.json to the phone and restart
    const configPayload = {
      modules: mods,
      updatedAt: new Date().toISOString(),
    };

    if (connection === "open" && server?.request) {
      try {
        await server.request(
          {
            type: "files:write",
            name: "bot-config.json",
            content: JSON.stringify(configPayload, null, 2),
          },
          "files:saved",
          10000
        );
        server.send({ type: "power", action: "restart" });
        setNote({ ok: true, text: "Saved bot-config.json + AI settings. Bot is restarting with zero Channel/Role ID setup." });
      } catch (e) {
        setNote({ ok: false, text: `Config write failed: ${e.message}. AI still synced via credentials.` });
      }
    } else {
      setNote({
        ok: true,
        text: "Saved in browser. Connect to the daemon and press Save & Sync again to push bot-config.json.",
      });
    }

    setSaving(false);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Bot Modules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          100% Zero Channel ID / Role ID setup. Toggle modules on. The bot auto-finds or creates channels by name
          (welcome, support, tickets, mod-logs, protect-logs, levels, member-add, ai-chat, music, General VC) and the
          Supporter role. Use <code className="text-zinc-300">!set <module></code> in any channel to bind that channel.
        </p>
      </div>

      {/* Modules grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map((m) => {
          const on = !!mods[m.id];
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                on ? "border-brand/50 bg-brand/10" : "border-line bg-panel hover:bg-white/5"
              }`}
            >
              <span className="mt-0.5 shrink-0 text-brand">
                {on ? <ToggleRight size={22} /> : <ToggleLeft size={22} className="text-zinc-500" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{m.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{m.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* AI Chat presets — no Channel ID */}
      <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand" />
          <h2 className="text-base font-semibold text-white">AI Chat Presets</h2>
        </div>
        <p className="text-sm text-zinc-500">
          Only API key required. Channel is auto-detected as <strong className="text-zinc-300">#ai-chat</strong> (created if missing).
          Providers: Groq, OpenRouter, OpenAI, Google Gemini.
        </p>

        <label className="block space-y-2 text-sm text-zinc-400">
          AI Provider
          <select className={INPUT} value={f.provider} onChange={(e) => pickProvider(e.target.value)}>
            {PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>
                {AI_PROVIDERS[id].label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-zinc-500">
            {preset.note}{" "}
            {preset.keyUrl && (
              <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-brand underline">
                Get an API key
              </a>
            )}
          </span>
        </label>

        <label className="block space-y-2 text-sm text-zinc-400">
          Endpoint URL {isCustom ? "" : "(set by the preset)"}
          <input
            className={INPUT}
            value={f.endpoint}
            onChange={(e) => set("endpoint", e.target.value)}
            disabled={!isCustom}
            placeholder="https://your-host/v1"
            spellCheck={false}
          />
        </label>

        <div className="space-y-2 text-sm text-zinc-400">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ai-model-mod">Model</label>
            {!isCustom && (
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : null} Refresh live models
              </button>
            )}
          </div>
          {isCustom ? (
            <input
              id="ai-model-mod"
              className={INPUT}
              value={f.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="model name"
              spellCheck={false}
            />
          ) : (
            <select id="ai-model-mod" className={INPUT} value={f.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="block space-y-2 text-sm text-zinc-400">
          AI API Key
          <div className="relative">
            <input
              className={`${INPUT} pr-10`}
              type={reveal ? "text" : "password"}
              value={f.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              title="Show / hide"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {note && (
        <p className={`text-sm ${note.ok ? "text-emerald-400" : "text-amber-400"}`}>{note.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={saveAndSync}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save & Sync to Bot
        </button>
        <span className="text-xs text-zinc-500">
          Writes <code className="text-zinc-400">bot-config.json</code> via files:write and restarts the bot (power:restart).
        </span>
      </div>
    </div>
  );
}
