"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

export default function StartupTab({ server }) {
  const { request, connection } = server;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    if (connection !== "open" && connection !== "demo") return;
    request({ type: "startup:get" }, "startup:settings")
      .then((r) => setForm(r.settings))
      .catch((e) => setNote({ error: true, text: e.message }));
  }, [connection, request]);

  const save = async () => {
    setSaving(true);
    try {
      await request({ type: "startup:set", settings: form }, "startup:saved");
      setNote({ text: "Startup settings saved." });
    } catch (e) {
      setNote({ error: true, text: e.message });
    }
    setSaving(false);
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold text-white">Startup Settings</h1>
      {!form ? (
        <p className="text-sm text-zinc-500">{note?.text ?? "Loading..."}</p>
      ) : (
        <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
          <label className="block space-y-2 text-sm text-zinc-400">
            Startup command
            <input className={INPUT} value={form.startupCommand} onChange={(e) => set("startupCommand", e.target.value)} />
          </label>
          <label className="block space-y-2 text-sm text-zinc-400">
            Node.js version
            <select className={INPUT} value={form.nodeVersion} onChange={(e) => set("nodeVersion", e.target.value)}>
              {["18", "20", "22"].map((v) => <option key={v} value={v}>Node {v}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between text-sm text-zinc-300">
            Auto-restart on crash
            <input type="checkbox" className="h-4 w-4 accent-[#5865F2]" checked={form.autoRestart} onChange={(e) => set("autoRestart", e.target.checked)} />
          </label>
          <div className="flex items-center gap-4">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            </button>
            {note && <span className={`text-xs ${note.error ? "text-rose-400" : "text-emerald-400"}`}>{note.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
