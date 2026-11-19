"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Save, Shield } from "lucide-react";
import { parseTunnelInput, resolveConnection } from "@/lib/connectionConfig";
import HostModeCards, { HOST_MODES } from "./HostModeCards";

const INPUT = "w-full rounded-lg border border-line bg-[#07090d] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-brand";

function Field({ label, hint, secret, revealed, onToggle, ...props }) {
  return (
    <label className="block space-y-1.5 text-sm text-zinc-400">
      {label}
      <div className="relative">
        <input
          {...props}
          type={secret && !revealed ? "password" : "text"}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className={`${INPUT} ${secret ? "pr-10" : ""}`}
        />
        {secret && (
          <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <span className="block text-xs text-amber-400">{hint}</span>}
    </label>
  );
}

export default function AdminPanel({ saved, onSave, user }) {
  const [form, setForm] = useState(saved);
  const [reveal, setReveal] = useState({});
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [saving, setSaving] = useState(false);
  const mode = form.hostMode === "railway" ? "railway" : "cloudflare";
  const modeMeta = HOST_MODES.find((m) => m.id === mode) || HOST_MODES[0];
  const resolved = useMemo(() => resolveConnection(form.tunnelUrl, form.authToken), [form.tunnelUrl, form.authToken]);

  useEffect(() => { setForm(saved); }, [saved]);

  useEffect(() => {
    fetch("/api/shared-host", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j || j.error) return;
        if (j.tunnelUrl || j.authToken) {
          setForm((f) => ({
            ...f,
            hostMode: j.hostMode || f.hostMode,
            tunnelUrl: j.tunnelUrl || f.tunnelUrl,
            authToken: j.authToken || f.authToken,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const onPasteUrl = (e) => {
    const text = e.clipboardData.getData("text");
    const p = parseTunnelInput(text);
    if (p.empty || p.error || text.trim() === p.base) return;
    e.preventDefault();
    setForm((f) => ({ ...f, tunnelUrl: p.base, authToken: f.authToken.trim() ? f.authToken : p.urlToken }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setOk(null);
    setError(null);
    const r = resolveConnection(form.tunnelUrl, form.authToken);
    if (r.status !== "ready") {
      setError(r.message);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shared-host", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostMode: mode,
          tunnelUrl: r.base,
          authToken: r.token,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Failed to save shared host");
        setSaving(false);
        return;
      }
      onSave({
        hostMode: mode,
        tunnelUrl: r.base,
        authToken: r.token,
        botToken: form.botToken?.trim() || saved.botToken || "",
        clientId: form.clientId?.trim() || saved.clientId || "",
      });
      setOk(
        j.tunnelHost
          ? `Shared host saved for ALL users (${j.tunnelHost}). Users only enter their own Bot Token + Client ID — they never see this URL.`
          : "Shared host saved for all users. Tunnel URL is hidden from non-admins."
      );
    } catch (err) {
      setError(err.message || "Network error");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={18} className="text-brand" />
          <h2 className="text-sm font-semibold text-white">Admin Panel — Shared daemon</h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Jo tunnel / Railway URL yahan save karoge, <strong className="text-zinc-300">sab logged-in users</strong> ke panel
          par wahi backend use hoga. Unko URL <strong className="text-zinc-300">nahi dikhegi</strong> — sirf apna Bot Token
          + Client ID daal kar bot online kar sakte hain. Logged in as{" "}
          <span className="text-zinc-300">{user?.global_name || user?.username}</span>
          {user?.id ? <span className="text-zinc-600"> ({user.id})</span> : null}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <HostModeCards mode={mode} onChange={(id) => set("hostMode", id)} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={modeMeta.urlLabel}
              placeholder={modeMeta.urlPlaceholder}
              value={form.tunnelUrl || ""}
              onChange={(e) => set("tunnelUrl", e.target.value)}
              onPaste={onPasteUrl}
              hint={modeMeta.urlHint}
            />
            <Field
              label="Backend Auth Token (AUTH_TOKEN)"
              secret
              revealed={reveal.auth}
              onToggle={() => toggle("auth")}
              value={form.authToken || ""}
              onChange={(e) => set("authToken", e.target.value)}
              placeholder="Same AUTH_TOKEN as backend .env"
            />
            <Field
              label="Your Discord Bot Token (optional — admin only)"
              secret
              revealed={reveal.bot}
              onToggle={() => toggle("bot")}
              value={form.botToken || ""}
              onChange={(e) => set("botToken", e.target.value)}
              placeholder="Admin's own bot token (users set theirs separately)"
            />
            <Field
              label="Your Discord Client ID (optional)"
              value={form.clientId || ""}
              onChange={(e) => set("clientId", e.target.value)}
              placeholder="Admin's Application ID"
            />
          </div>

          {resolved.status === "ready" ? (
            <p className="text-xs text-emerald-400">Ready: {resolved.maskedUrl}</p>
          ) : (
            <p className="text-xs text-zinc-500">{resolved.message}</p>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {ok && <p className="text-sm text-emerald-400">{ok}</p>}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80 disabled:opacity-50"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save shared host for all users"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-panel/50 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">How it works</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Admin sets Termux Cloudflare tunnel URL or Railway URL + AUTH_TOKEN once.</li>
          <li>Every user panel auto-connects to that same daemon (URL hidden).</li>
          <li>Each user puts their own Bot Token + Client ID → their bot goes online on the shared host.</li>
        </ul>
        <p className="mt-3 font-medium text-zinc-400">Discord OAuth callback</p>
        <p className="mt-1 font-mono text-zinc-300 break-all">
          {typeof window !== "undefined" ? `${window.location.origin}/api/auth/callback` : "https://YOUR-PANEL.vercel.app/api/auth/callback"}
        </p>
      </div>
    </div>
  );
}
