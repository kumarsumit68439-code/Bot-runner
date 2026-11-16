"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { AI_PROVIDERS, PROVIDER_ORDER, fetchLiveModels } from "@/lib/aiPresets";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand disabled:opacity-60";

function initial(saved) {
  const provider = AI_PROVIDERS[saved.aiProvider] ? saved.aiProvider : "groq";
  const preset = AI_PROVIDERS[provider];
  return {
    provider,
    endpoint: saved.aiEndpoint || preset.endpoint,
    model: saved.aiModel || preset.defaultModel,
    apiKey: saved.aiApiKey || "",
    channelId: saved.aiChannelId || "",
  };
}

function syncInfo(connection, sync) {
  if (connection !== "open") return ["text-amber-300", "Not connected to the daemon. Settings are saved in this browser and sync automatically when it connects."];
  if (sync.state === "syncing") return ["text-amber-300", "Syncing to the phone..."];
  if (sync.state === "synced") return ["text-emerald-400", "Synced to bot-credentials.json on the phone. The bot restarts with the new AI settings."];
  if (sync.state === "error") return ["text-rose-400", `Sync failed: ${sync.error}`];
  return ["text-zinc-500", "Connected. Press Save & Sync to send the AI settings to the bot."];
}

export default function AiSettings({ saved, connection, sync, onSave }) {
  const [f, setF] = useState(() => initial(saved));
  const [live, setLive] = useState(null); // null = built-in preset list
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);
  const [reveal, setReveal] = useState(false);

  // Follow external changes (for example "Clear saved data").
  useEffect(() => { setF(initial(saved)); setLive(null); }, [saved.aiProvider, saved.aiEndpoint, saved.aiModel, saved.aiApiKey, saved.aiChannelId]);

  const preset = AI_PROVIDERS[f.provider];
  const isCustom = f.provider === "custom";
  const baseModels = live ?? preset.models;
  const models = baseModels.some((m) => m.id === f.model) || !f.model ? baseModels : [{ id: f.model, label: `${f.model} (current)` }, ...baseModels];
  const [infoColor, infoText] = syncInfo(connection, sync);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

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
      setNote({ ok: false, text: `${e.message} Keeping the built-in list. (Some providers block browser requests; the built-in list still works.)` });
    }
    setLoading(false);
  };

  const submit = (e) => {
    e.preventDefault();
    const apiKey = f.apiKey.trim();
    const channelId = f.channelId.trim();
    const endpoint = f.endpoint.trim();
    const model = f.model.trim();
    if (!apiKey && !channelId) {
      setError(null);
      return onSave({ aiProvider: f.provider, aiEndpoint: endpoint, aiModel: model, aiApiKey: "", aiChannelId: "" }); // clears both = AI chat off
    }
    if (!apiKey || !channelId) return setError("Fill both the API key and the Channel ID, or clear both to turn AI chat off.");
    if (!/^\d{15,25}$/.test(channelId)) return setError("A Discord Channel ID is a number (17-20 digits). In Discord: User Settings > Advanced > Developer Mode, then right-click the channel > Copy Channel ID.");
    if (!/^https?:\/\/\S+$/i.test(endpoint)) return setError("The endpoint must be a full URL starting with https://");
    if (!model) return setError("Choose or enter a model.");
    setError(null);
    onSave({ aiProvider: f.provider, aiEndpoint: endpoint, aiModel: model, aiApiKey: apiKey, aiChannelId: channelId });
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5 rounded-xl border border-line bg-panel p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand" />
        <h2 className="text-base font-semibold text-white">AI Chat</h2>
      </div>
      <p className="text-sm text-zinc-500">The bot answers every message in one Discord channel using an OpenAI-compatible AI provider. You only need an API key and the channel ID.</p>

      <label className="block space-y-2 text-sm text-zinc-400">
        AI Provider
        <select className={INPUT} value={f.provider} onChange={(e) => pickProvider(e.target.value)}>
          {PROVIDER_ORDER.map((id) => <option key={id} value={id}>{AI_PROVIDERS[id].label}</option>)}
        </select>
        <span className="block text-xs text-zinc-500">
          {preset.note}{" "}
          {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-brand underline">Get an API key</a>}
        </span>
      </label>

      <label className="block space-y-2 text-sm text-zinc-400">
        Endpoint URL {isCustom ? "" : "(set by the preset)"}
        <input className={INPUT} value={f.endpoint} onChange={(e) => set("endpoint", e.target.value)} disabled={!isCustom} placeholder="https://your-host/v1" spellCheck={false} />
      </label>

      <div className="space-y-2 text-sm text-zinc-400">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="ai-model">Model</label>
          {!isCustom && (
            <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline disabled:opacity-50">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh live models
            </button>
          )}
        </div>
        {isCustom ? (
          <input id="ai-model" className={INPUT} value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="model name" spellCheck={false} />
        ) : (
          <select id="ai-model" className={INPUT} value={f.model} onChange={(e) => set("model", e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
        {note && <p className={`text-xs ${note.ok ? "text-emerald-400" : "text-amber-400"}`}>{note.text}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
            <button type="button" onClick={() => setReveal((r) => !r)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" title="Show / hide">
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label className="block space-y-2 text-sm text-zinc-400">
          AI Channel ID
          <input className={INPUT} value={f.channelId} onChange={(e) => set("channelId", e.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} />
        </label>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80">
          <Save size={15} /> Save &amp; Sync
        </button>
        <span className={`text-xs ${infoColor}`}>{infoText}</span>
      </div>

      <p className="text-xs text-zinc-500">
        The bot needs the Message Content Intent: Discord Developer Portal > your app > Bot > Privileged Gateway Intents. The API key is stored in this browser and in bot-credentials.json on your phone, in plain text.
      </p>
    </form>
  );
}
