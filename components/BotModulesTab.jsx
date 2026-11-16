"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
import { AI_PROVIDERS, PROVIDER_ORDER, fetchLiveModels } from "@/lib/aiPresets";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand disabled:opacity-60";

/** Mo Hub-style modules — ON/OFF only, zero Channel ID / Role ID */
export const MODULES = [
  { id: "simple", label: "Simple Bot", desc: "Prefix commands anywhere in the server. No channel ID." },
  { id: "welcome", label: "Welcome Bot", desc: "Posts welcome in #welcome (auto-created)." },
  { id: "support", label: "Support Bot", desc: "Replies / staff alerts in #support (auto)." },
  { id: "channelbuilder", label: "Channel & VC Builder", desc: "!setupchannels — categories, text & voice. Admin only." },
  { id: "rolesetup", label: "Server Setup (Roles)", desc: "!setuproles — creates standard roles. Admin only." },
  { id: "tickets", label: "Ticket Bot", desc: "Panel in #tickets · private ticket channels." },
  { id: "antinuke", label: "Security Anti-Nuke", desc: "Mass channel-delete protection → #mod-logs." },
  { id: "tokenclaim", label: "Token Claim", desc: "Claim panel flow in #tickets." },
  { id: "moderation", label: "Moderation", desc: "!warn !kick !ban !timeout !purge — logs → #mod-logs." },
  { id: "voice", label: "Voice Bot", desc: "Join/leave voice helpers (commands in any channel)." },
  { id: "protect", label: "Server Protection", desc: "Anti-spam, invites, mass-mention → #protect-logs." },
  { id: "leveling", label: "Level-up", desc: "XP + level announcements in #levels." },
  { id: "memberadd", label: "Member Add", desc: "Join logs / invite flow in #member-add." },
  { id: "banbot", label: "Ban Bot", desc: "Ban + ban logs in #mod-logs." },
  { id: "aichat", label: "AI Chat", desc: "AI replies only in #ai-chat (auto). API key below." },
  { id: "supporter", label: "Supporter", desc: "Auto-assign Supporter role on join (role auto-created)." },
  { id: "music", label: "Music Bot", desc: "Music commands; preferred #music + General VC." },
  { id: "invitetracker", label: "Invite Tracker", desc: "Tracks who invited whom; logs joins with inviter." },
];

const DEFAULT_MODULES = Object.fromEntries(MODULES.map((m) => [m.id, false]));
DEFAULT_MODULES.simple = true;
DEFAULT_MODULES.welcome = true;
DEFAULT_MODULES.aichat = true;
DEFAULT_MODULES.protect = true;
DEFAULT_MODULES.memberadd = true;
DEFAULT_MODULES.supporter = true;

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
      setNote({ ok: false, text: `${e.message} Keeping the built-in list.` });
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
    onSaveAi({
      aiProvider: f.provider,
      aiEndpoint: endpoint,
      aiModel: model,
      aiApiKey: apiKey,
      aiChannelId: "",
    });
    saveModulesLocal(mods);
    const configPayload = { modules: mods, updatedAt: new Date().toISOString() };
    if (connection === "open" && server?.request) {
      try {
        await server.request(
          { type: "files:write", name: "bot-config.json", content: JSON.stringify(configPayload, null, 2) },
          "files:saved",
          10000
        );
        server.send({ type: "power", action: "restart" });
        setNote({ ok: true, text: "Saved bot-config.json + AI. Bot restarting — zero Channel/Role ID." });
      } catch (e) {
        setNote({ ok: false, text: `Config write failed: ${e.message}. AI still synced via credentials.` });
      }
    } else {
      setNote({ ok: true, text: "Saved in browser. Connect daemon and Save & Sync again to push bot-config.json." });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Bot Modules</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add your Client ID and bot token, then pick modules.{" "}
          <strong className="text-zinc-300">No Channel IDs required</strong> — bot finds or creates channels by name.
          Bind with <code className="text-zinc-300">{`!set <module>`}</code>.
        </p>
      </div>

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

      <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand" />
          <h2 className="text-base font-semibold text-white">AI Chat Presets</h2>
        </div>
        <p className="text-sm text-zinc-500">
          Only API key required. Channel auto: <strong className="text-zinc-300">#ai-chat</strong>.
        </p>
        <label className="block space-y-2 text-sm text-zinc-400">
          AI Provider
          <select className={INPUT} value={f.provider} onChange={(e) => pickProvider(e.target.value)}>
            {PROVIDER_ORDER.map((id) => (
              <option key={id} value={id}>{AI_PROVIDERS[id].label}</option>
            ))}
          </select>
          <span className="block text-xs text-zinc-500">
            {preset.note}{" "}
            {preset.keyUrl && (
              <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-brand underline">Get an API key</a>
            )}
          </span>
        </label>
        <label className="block space-y-2 text-sm text-zinc-400">
          Endpoint URL {isCustom ? "" : "(set by the preset)"}
          <input className={INPUT} value={f.endpoint} onChange={(e) => set("endpoint", e.target.value)} disabled={!isCustom} placeholder="https://your-host/v1" spellCheck={false} />
        </label>
        <div className="space-y-2 text-sm text-zinc-400">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ai-model-mod">Model</label>
            {!isCustom && (
              <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline disabled:opacity-50">
                {loading ? <Loader2 size={13} className="animate-spin" /> : null} Refresh live models
              </button>
            )}
          </div>
          {isCustom ? (
            <input id="ai-model-mod" className={INPUT} value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="model name" spellCheck={false} />
          ) : (
            <select id="ai-model-mod" className={INPUT} value={f.model} onChange={(e) => set("model", e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
        </div>
        <label className="block space-y-2 text-sm text-zinc-400">
          AI API Key
          <div className="relative">
            <input className={`${INPUT} pr-10`} type={reveal ? "text" : "password"} value={f.apiKey} onChange={(e) => set("apiKey", e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => setReveal((r) => !r)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{reveal ? "Hide" : "Show"}</button>
          </div>
        </label>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {note && <p className={`text-sm ${note.ok ? "text-emerald-400" : "text-amber-400"}`}>{note.text}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={saveAndSync} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save & Sync to Bot
        </button>
        <span className="text-xs text-zinc-500">Writes <code className="text-zinc-400">bot-config.json</code> + restart.</span>
      </div>
    </div>
  );
}
