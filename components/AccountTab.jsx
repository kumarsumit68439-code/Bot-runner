"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot as BotIcon, ImagePlus, Link2, RefreshCw, Trash2, UserPlus } from "lucide-react";

const LS_KEY = "botpanel.account.profile.v1";
const BTN =
  "inline-flex items-center gap-2 rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

// Invite permission presets (bitfields). Slash commands come from the applications.commands scope.
const INVITE_PERMS = {
  recommended: { label: "Recommended permissions", value: "3525696" },
  admin: { label: "Administrator", value: "8" },
  none: { label: "No extra permissions", value: "0" },
};

function loadLocal(id) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return all[id] || {};
  } catch {
    return {};
  }
}
function saveLocal(id, value) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    all[id] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Read KEY=value lines (the same format the Environment tab writes to bot/.env). */
function parseEnvVars(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file is not a valid image."));
    img.src = src;
  });
}

/** Resize + center-crop an uploaded file (avatar 512x512, banner 960x384) so it stays small. */
async function prepareImage(file, kind) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const raw = await readAsDataUrl(file);
  if (file.type === "image/gif" && file.size <= 2.5 * 1024 * 1024) return raw;
  const img = await loadImage(raw);
  const [w, h] = kind === "avatar" ? [512, 512] : [960, 384];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  return kind === "avatar" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
}

function discordAvatarUrl(user) {
  if (user?.avatar) {
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  let n = 0;
  try { n = Number((BigInt(user.id) >> 22n) % 6n); } catch {}
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}
function discordBannerUrl(user) {
  if (!user?.banner) return null;
  const ext = String(user.banner).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=600`;
}

function ProfileCard({ bannerSrc, avatarSrc, accent, title, subtitle, badge }) {
  const [bannerOk, setBannerOk] = useState(true);
  const [avatarOk, setAvatarOk] = useState(true);
  useEffect(() => setBannerOk(true), [bannerSrc]);
  useEffect(() => setAvatarOk(true), [avatarSrc]);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="h-28 w-full sm:h-36" style={{ background: accent || "linear-gradient(135deg,#1f2937,#0f172a)" }}>
        {bannerSrc && bannerOk && (
          <img src={bannerSrc} alt="" className="h-full w-full object-cover" onError={() => setBannerOk(false)} />
        )}
      </div>
      <div className="px-5 pb-5">
        <div className="-mt-10 flex items-end gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-panel bg-zinc-800">
            {avatarSrc && avatarOk ? (
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" onError={() => setAvatarOk(false)} />
            ) : (
              <div className="grid h-full w-full place-items-center text-zinc-500">
                <BotIcon size={28} />
              </div>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="truncate text-base font-semibold text-white">{title}</p>
            <p className="truncate text-xs text-zinc-500">{subtitle}</p>
          </div>
          {badge && (
            <span className="mb-1 ml-auto shrink-0 rounded-full bg-brand/15 px-2.5 py-1 text-xs text-brand ring-1 ring-brand/30">
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageControls({ label, busy, onFile, onUrl, onRemove, removeLabel }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-line bg-[#07090d] p-3">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={BTN}>
          <ImagePlus size={14} /> Upload
        </button>
        <button type="button" disabled={busy} onClick={onRemove} className={`${BTN} text-rose-300`}>
          <Trash2 size={14} /> {removeLabel}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://... image link"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={async () => {
            const ok = await onUrl(url.trim());
            if (ok) setUrl("");
          }}
          className={BTN}
        >
          <Link2 size={14} /> Apply
        </button>
      </div>
    </div>
  );
}

function Notice({ note }) {
  if (!note) return null;
  const tone =
    note.kind === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return <p className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>{note.text}</p>;
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="truncate text-right text-sm text-zinc-200">{value}</span>
    </div>
  );
}

export default function AccountTab({ user, config, server }) {
  const serverRef = useRef(server);
  serverRef.current = server;
  const connected = server?.connection === "open";

  // Values the Environment tab saved into bot/.env on the daemon (CLIENT_ID, BOT_TOKEN ...).
  const [envVars, setEnvVars] = useState({});
  const loadEnv = useCallback(async () => {
    const s = serverRef.current;
    if (!s?.request) return;
    try {
      const res = await s.request({ type: "files:read", name: ".env" }, "files:content", 8000);
      setEnvVars(parseEnvVars(typeof res.content === "string" ? res.content : ""));
    } catch {
      /* no .env yet */
    }
  }, []);
  useEffect(() => {
    if (connected) loadEnv();
  }, [connected, loadEnv]);

  // Bot login token: panel config first, then the Environment tab (.env). Never shown on screen.
  const botToken = config?.botToken || envVars.BOT_TOKEN || envVars.DISCORD_TOKEN || "";

  // ---- Your Discord account (real avatar/banner from Discord + optional panel-only override) ----
  const [local, setLocal] = useState({});
  const [userNote, setUserNote] = useState(null);
  const [userBusy, setUserBusy] = useState(false);

  useEffect(() => {
    if (user?.id) setLocal(loadLocal(user.id));
  }, [user?.id]);

  const updateLocal = (patch, okText) => {
    const next = { ...local, ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    if (!saveLocal(user.id, next)) {
      setUserNote({ kind: "error", text: "Could not save. Browser storage is full or blocked." });
      return false;
    }
    setLocal(next);
    setUserNote({ kind: "ok", text: okText });
    return true;
  };

  const userUpload = async (file, kind) => {
    setUserBusy(true);
    try {
      const data = await prepareImage(file, kind);
      updateLocal({ [kind]: data }, `${kind === "avatar" ? "Avatar" : "Banner"} updated on this panel.`);
    } catch (e) {
      setUserNote({ kind: "error", text: e.message || "Upload failed." });
    }
    setUserBusy(false);
  };
  const userUrl = async (value, kind) => {
    if (!/^https?:\/\/\S+$/i.test(value)) {
      setUserNote({ kind: "error", text: "Enter a valid http(s) image link." });
      return false;
    }
    return updateLocal({ [kind]: value }, `${kind === "avatar" ? "Avatar" : "Banner"} updated on this panel.`);
  };

  // ---- Bot profile (real, changed on Discord through the bot token) ----
  const [bot, setBot] = useState(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botNote, setBotNote] = useState(null);
  const [permKey, setPermKey] = useState("recommended");

  const callBot = useCallback(
    async (extra = {}) => {
      const r = await fetch("/api/bot/profile", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      return j.profile;
    },
    [botToken]
  );

  const refreshBot = useCallback(async () => {
    if (!botToken) {
      setBot(null);
      return;
    }
    setBotLoading(true);
    setBotNote(null);
    try {
      setBot(await callBot());
    } catch (e) {
      setBot(null);
      setBotNote({ kind: "error", text: e.message || "Could not load the bot profile." });
    }
    setBotLoading(false);
  }, [botToken, callBot]);

  useEffect(() => {
    refreshBot();
  }, [refreshBot]);

  const refreshAll = () => {
    loadEnv();
    refreshBot();
  };

  const applyBot = async (kind, spec, okText) => {
    setBotBusy(true);
    setBotNote(null);
    try {
      setBot(await callBot({ [kind]: spec }));
      setBotNote({ kind: "ok", text: okText });
      setBotBusy(false);
      return true;
    } catch (e) {
      setBotNote({ kind: "error", text: e.message || "Update failed." });
      setBotBusy(false);
      return false;
    }
  };
  const botUpload = async (file, kind) => {
    setBotBusy(true);
    setBotNote(null);
    try {
      const data = await prepareImage(file, kind);
      setBotBusy(false);
      await applyBot(kind, { type: "data", value: data }, `Bot ${kind} updated on Discord.`);
    } catch (e) {
      setBotNote({ kind: "error", text: e.message || "Upload failed." });
      setBotBusy(false);
    }
  };

  // ---- Invite link: Client ID from Environment (.env) -> bot setup -> the bot's own ID ----
  const envClientId = String(envVars.CLIENT_ID || "").trim();
  const cfgClientId = String(config?.clientId || "").trim();
  const clientId = envClientId || cfgClientId || bot?.id || "";
  const clientIdSource = envClientId ? "Environment" : cfgClientId ? "Bot setup" : bot?.id ? "bot token" : null;
  const clientIdValid = /^\d{15,25}$/.test(clientId);
  const inviteUrl = clientIdValid
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${INVITE_PERMS[permKey].value}&integration_type=0&scope=bot+applications.commands`
    : null;
  const guilds = bot ? bot.guildCount : null;

  const accentStyle = user?.accent_color != null ? `#${Number(user.accent_color).toString(16).padStart(6, "0")}` : null;
  const userAvatar = local.avatar || discordAvatarUrl(user);
  const userBanner = local.banner || discordBannerUrl(user);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-white">Account</h1>

      {/* ---------- Your account ---------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Your Discord account</h2>
        <ProfileCard
          bannerSrc={userBanner}
          avatarSrc={userAvatar}
          accent={accentStyle}
          title={user?.global_name || user?.username}
          subtitle={`@${user?.username}`}
          badge={user?.isAdmin || String(user?.id) === "1487343086198853785" ? "Owner" : "Member"}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <ImageControls
            label="Account avatar"
            busy={userBusy}
            removeLabel="Use Discord avatar"
            onFile={(f) => userUpload(f, "avatar")}
            onUrl={(v) => userUrl(v, "avatar")}
            onRemove={() => updateLocal({ avatar: null }, "Back to your Discord avatar.")}
          />
          <ImageControls
            label="Account banner"
            busy={userBusy}
            removeLabel="Use Discord banner"
            onFile={(f) => userUpload(f, "banner")}
            onUrl={(v) => userUrl(v, "banner")}
            onRemove={() => updateLocal({ banner: null }, "Back to your Discord banner.")}
          />
        </div>
        <Notice note={userNote} />
        <p className="text-xs text-zinc-500">
          Discord does not let websites change a person&apos;s real account avatar or banner, so these two only change how you look inside this panel (saved in this browser). Your real banner shows after you log in again.
        </p>
        <div className="rounded-xl border border-line bg-panel px-5 py-2">
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Account check</p>
          <Row label="Discord ID" value={user?.id} />
          <Row label="Username" value={`@${user?.username}`} />
          <Row label="Display name" value={user?.global_name || user?.username} />
          <Row label="Login" value="Discord OAuth (verified)" />
          <Row label="Bot token" value={botToken ? "Saved (hidden)" : "Not set"} />
          <Row label="Client ID" value={clientId ? clientId : "Not set"} />
          <Row
            label="Bot invited"
            value={guilds == null ? "Unknown" : guilds > 0 ? `Yes (${guilds} server${guilds === 1 ? "" : "s"})` : "No"}
          />
        </div>
      </section>

      {/* ---------- Bot profile ---------- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Bot profile</h2>
          {(botToken || connected) && (
            <button type="button" onClick={refreshAll} disabled={botLoading || botBusy} className={BTN}>
              <RefreshCw size={14} className={botLoading ? "animate-spin" : ""} /> Refresh
            </button>
          )}
        </div>

        {!botToken && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            No bot token found. Add <code>BOT_TOKEN</code> in the Environment tab (or the Bot Token in the connection setup), then press Refresh to see and edit the bot profile.
          </p>
        )}

        {botToken && botLoading && !bot && <p className="text-sm text-zinc-500">Loading bot profile...</p>}

        {bot && (
          <>
            <ProfileCard
              bannerSrc={bot.bannerUrl}
              avatarSrc={bot.avatarUrl}
              accent={bot.accentColor}
              title={bot.globalName || bot.username}
              subtitle={`@${bot.username} \u00b7 ID ${bot.id}`}
              badge="Bot"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <ImageControls
                label="Bot avatar (changes on Discord)"
                busy={botBusy}
                removeLabel="Remove"
                onFile={(f) => botUpload(f, "avatar")}
                onUrl={(v) => applyBot("avatar", { type: "url", value: v }, "Bot avatar updated on Discord.")}
                onRemove={() => applyBot("avatar", { type: "remove" }, "Bot avatar removed.")}
              />
              <ImageControls
                label="Bot banner (changes on Discord)"
                busy={botBusy}
                removeLabel="Remove"
                onFile={(f) => botUpload(f, "banner")}
                onUrl={(v) => applyBot("banner", { type: "url", value: v }, "Bot banner updated on Discord.")}
                onRemove={() => applyBot("banner", { type: "remove" }, "Bot banner removed.")}
              />
            </div>
          </>
        )}

        <Notice note={botNote} />
        {botToken && (
          <p className="text-xs text-zinc-500">
            Only the bot&apos;s public profile is shown. The token is never displayed. Discord limits how often a bot avatar/banner can be changed, so if it says rate limit, wait a bit and try again.
          </p>
        )}

        {/* ---------- Invite bot ---------- */}
        <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Invite bot to a server</p>
              <p className="text-xs text-zinc-500">
                {clientIdValid
                  ? `Client ID from ${clientIdSource}: ${clientId}`
                  : clientId
                  ? "The Client ID looks invalid. It should be only digits (Developer Portal > General Information > Application ID)."
                  : "Add CLIENT_ID in the Environment tab to turn this into a working invite button."}
              </p>
            </div>
            {guilds == null ? (
              <span className="rounded-full bg-zinc-500/15 px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-zinc-500/30">
                Invite status unknown
              </span>
            ) : guilds > 0 ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
                Invited \u00b7 {guilds} server{guilds === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30">
                Not invited
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={permKey}
              onChange={(e) => setPermKey(e.target.value)}
              className="rounded-md border border-line bg-[#07090d] px-3 py-2 text-sm text-zinc-200 outline-none"
            >
              {Object.entries(INVITE_PERMS).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
            {inviteUrl ? (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752C4]"
              >
                <UserPlus size={15} /> {guilds > 0 ? "Invite to another server" : "Invite bot"}
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200/80"
              >
                <UserPlus size={15} /> Not invited (add Client ID)
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            After you add the bot in Discord, press Refresh above and the badge changes to Invited. If Discord says the bot is private, turn on Public Bot (or log in with the bot owner account) in the Developer Portal.
          </p>
        </div>
      </section>
    </div>
  );
}
