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
  const mode = form.hostMode === "railway" ? "railway" : "cloudflare";
  const modeMeta = HOST_MODES.find((m) => m.id === mode) || HOST_MODES[0];
  const resolved = useMemo(() => resolveConnection(form.tunnelUrl, form.authToken), [form.tunnelUrl, form.authToken]);

  useEffect(() => { setForm(saved); }, [saved]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setReveal((r) => ({ ...r, [k]: !r[k] }));

  const onPasteUrl = (e) => {
    const text = e.clipboardData.getData("text");
    const p = parseTunnelInput(text);
    if (p.empty || p.error || text.trim() === p.base) return;
    e.preventDefault();
    setForm((f) => ({ ...f, tunnelUrl: p.base, authToken: f.authToken.trim() ? f.authToken : p.urlToken }));
  };

  const submit = (e) => {
    e.preventDefault();
    setOk(null);
    const r = resolveConnection(form.tunnelUrl, form.authToken);
    if (r.status !== "ready") {
      setError(r.message);
      return;
    }
    setError(null);
    onSave({
      hostMode: mode,
      tunnelUrl: r.base,
      authToken: r.token,
      botToken: form.botToken.trim(),
      clientId: form.clientId.trim(),
    });
    setOk("Saved. Connection will use the new tunnel URL.");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={18} className="text-brand" />
          <h2 className="text-sm font-semibold text-white">Admin Panel</h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Tunnel / Railway URLs stay here only — not on the public dashboard. Logged in as{" "}
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
              label="Discord Bot Token"
              secret
              revealed={reveal.bot}
              onToggle={() => toggle("bot")}
              value={form.botToken || ""}
              onChange={(e) => set("botToken", e.target.value)}
              placeholder="Bot token from Discord Developer Portal"
            />
            <Field
              label="Discord Client ID (Application ID)"
              value={form.clientId || ""}
              onChange={(e) => set("clientId", e.target.value)}
              placeholder="17–20 digit Application ID"
            />
          </div>

          {resolved.status === "ready" ? (
            <p className="text-xs text-emerald-400">Ready: {resolved.maskedUrl}</p>
          ) : (
            <p className="text-xs text-zinc-500">{resolved.message}</p>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {ok && <p className="text-sm text-emerald-400">{ok}</p>}

          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/80">
            <Save size={15} /> Save admin connection
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-dashed border-line bg-panel/50 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">Discord OAuth callback (paste in Developer Portal)</p>
        <p className="mt-2 font-mono text-zinc-300 break-all">
          {typeof window !== "undefined" ? `${window.location.origin}/api/auth/callback` : "https://YOUR-PANEL.vercel.app/api/auth/callback"}
        </p>
        <p className="mt-2">Vercel env: <code className="text-zinc-400">NEXT_PUBLIC_DISCORD_CLIENT_ID</code>, <code className="text-zinc-400">DISCORD_CLIENT_SECRET</code>, <code className="text-zinc-400">DISCORD_ADMIN_IDS</code> (your Discord user id), optional <code className="text-zinc-400">SESSION_SECRET</code>.</p>
      </div>
    </div>
  );
}
