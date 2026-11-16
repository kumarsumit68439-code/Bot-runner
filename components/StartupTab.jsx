"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, Server } from "lucide-react";

const INPUT =
  "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

const STORAGE_OPTIONS = [
  "512 GB",
  "1 TB",
  "2 TB",
  "3 TB",
  "4 TB",
  "5 TB",
  "6 TB",
  "7 TB",
  "8 TB",
  "9 TB",
  "10 TB",
  "25 TB",
  "50 TB",
  "100 TB",
];

const RAM_OPTIONS = ["512 MB", "2 GB", "4 GB", "8 GB", "16 GB", "32 GB", "64 GB", "128 GB"];

const CPU_OPTIONS = ["1 vCPU", "2 vCPU", "4 vCPU", "8 vCPU", "16 vCPU", "32 vCPU"];

const GPU_OPTIONS = [
  "None (CPU Only)",
  "NVIDIA T4 (16GB VRAM)",
  "NVIDIA RTX 4090 (24GB)",
  "NVIDIA A100 (80GB)",
  "NVIDIA H100 (80GB)",
];

const DEFAULTS = {
  startupCommand: "node index.js",
  nodeVersion: "20",
  autoRestart: true,
  storageLimit: "512 GB",
  ramAllocation: "512 MB",
  cpuCores: "1 vCPU",
  gpuAccel: "None (CPU Only)",
};

export default function StartupTab({ server }) {
  const serverRef = useRef(server);
  serverRef.current = server;
  const connection = server?.connection;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);
  const loaded = useRef(false);

  const fetchSettings = useCallback(async () => {
    const s = serverRef.current;
    if (!s?.request) return;
    try {
      const r = await s.request({ type: "startup:get" }, "startup:settings", 8000);
      setForm({ ...DEFAULTS, ...(r.settings || {}) });
      setNote(null);
    } catch (e) {
      setNote({ error: true, text: e.message });
    }
  }, []);

  useEffect(() => {
    if (connection !== "open" && connection !== "demo") {
      loaded.current = false;
      return;
    }
    if (loaded.current) return;
    loaded.current = true;
    fetchSettings();
  }, [connection, fetchSettings]);

  const save = async () => {
    const s = serverRef.current;
    if (!s?.request || !form) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await s.request({ type: "startup:set", settings: form }, "startup:saved", 10000);
      if (r.error) throw new Error(r.error);
      if (r.settings) setForm({ ...DEFAULTS, ...r.settings });
      setNote({ text: "Startup & resource settings saved." });
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
        <div className="space-y-5">
          <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
            <label className="block space-y-2 text-sm text-zinc-400">
              Startup command
              <input
                className={INPUT}
                value={form.startupCommand}
                onChange={(e) => set("startupCommand", e.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm text-zinc-400">
              Node.js version
              <select className={INPUT} value={form.nodeVersion} onChange={(e) => set("nodeVersion", e.target.value)}>
                {["18", "20", "22"].map((v) => (
                  <option key={v} value={v}>
                    Node {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between text-sm text-zinc-300">
              Auto-restart on crash
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#5865F2]"
                checked={!!form.autoRestart}
                onChange={(e) => set("autoRestart", e.target.checked)}
              />
            </label>
          </div>

          <div className="space-y-5 rounded-xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-brand" />
              <h2 className="text-base font-semibold text-white">Server Resources &amp; Hardware Specs</h2>
            </div>
            <p className="text-xs text-zinc-500">
              Display limits for the console dashboard (saved to settings.json). These are panel/cloud-style specs — they do
              not resize the phone hardware.
            </p>
            <label className="block space-y-2 text-sm text-zinc-400">
              Storage Limit
              <select className={INPUT} value={form.storageLimit || DEFAULTS.storageLimit} onChange={(e) => set("storageLimit", e.target.value)}>
                {STORAGE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-zinc-400">
              RAM Allocation
              <select className={INPUT} value={form.ramAllocation || DEFAULTS.ramAllocation} onChange={(e) => set("ramAllocation", e.target.value)}>
                {RAM_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-zinc-400">
              CPU Cores
              <select className={INPUT} value={form.cpuCores || DEFAULTS.cpuCores} onChange={(e) => set("cpuCores", e.target.value)}>
                {CPU_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-zinc-400">
              GPU Acceleration
              <select className={INPUT} value={form.gpuAccel || DEFAULTS.gpuAccel} onChange={(e) => set("gpuAccel", e.target.value)}>
                {GPU_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={save}
              disabled={saving || connection !== "open"}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-40"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            </button>
            {note && <span className={`text-xs ${note.error ? "text-rose-400" : "text-emerald-400"}`}>{note.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
