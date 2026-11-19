const KEY = "botpanel.connection.v1";
const SYNC_KEY = "botpanel.lastSyncedHash.v1";

export const EMPTY_CONFIG = {
  hostMode: "cloudflare", // "cloudflare" (Termux tunnel) | "railway"
  tunnelUrl: "",
  authToken: "",
  botToken: "",
  clientId: "",
  aiProvider: "groq",
  aiEndpoint: "",
  aiModel: "",
  aiApiKey: "",
  aiChannelId: "",
  youtubeApiKey: "",
  youtubeCookies: "",
  spotifyClientId: "",
  spotifyClientSecret: "",
};

const PROTOCOL_MAP = { "http:": "ws:", "https:": "wss:", "ws:": "ws:", "wss:": "wss:" };

export function parseTunnelInput(input) {
  const raw = String(input ?? "").replace(/\s+/g, "");
  if (!raw) return { empty: true, base: "", urlToken: "", error: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `wss://${raw}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return { empty: false, base: "", urlToken: "", error: "This is not a valid URL." };
  }
  const protocol = PROTOCOL_MAP[u.protocol];
  if (!protocol) return { empty: false, base: "", urlToken: "", error: `Unsupported protocol "${u.protocol}". Use https:// or wss://.` };
  if (!u.hostname) return { empty: false, base: "", urlToken: "", error: "The URL has no host name." };
  return { empty: false, base: `${protocol}//${u.host}`, urlToken: u.searchParams.get("token") || "", error: null };
}

export function maskToken(token) {
  const t = String(token ?? "");
  if (t.length <= 4) return `**** (${t.length} chars)`;
  return `${t.slice(0, 2)}...${t.slice(-2)} (${t.length} chars)`;
}

export function resolveConnection(tunnelInput, authTokenInput) {
  const p = parseTunnelInput(tunnelInput);
  if (p.empty) return { status: "empty", wsUrl: null, maskedUrl: null, base: "", token: "", tokenFromUrl: false, urlTokenIgnored: false, message: "Enter the tunnel URL." };
  if (p.error) return { status: "invalid", wsUrl: null, maskedUrl: null, base: "", token: "", tokenFromUrl: false, urlTokenIgnored: false, message: p.error };

  const typed = String(authTokenInput ?? "").trim();
  const token = typed || p.urlToken;
  if (!token) {
    return { status: "no-token", wsUrl: null, maskedUrl: null, base: p.base, token: "", tokenFromUrl: false, urlTokenIgnored: false, message: "Backend Auth Token is missing. Fill the field, or paste a URL that ends with ?token=..." };
  }
  return {
    status: "ready",
    wsUrl: `${p.base}/?token=${encodeURIComponent(token)}`,
    maskedUrl: `${p.base}/?token=${maskToken(token)}`,
    base: p.base,
    token,
    tokenFromUrl: !typed,
    urlTokenIgnored: !!typed && !!p.urlToken && p.urlToken !== typed,
    message: null,
  };
}

export function buildWsUrl(tunnelUrl, authToken) {
  return resolveConnection(tunnelUrl, authToken).wsUrl;
}

export function credentialPayload(cfg) {
  return {
    botToken: cfg.botToken || "",
    clientId: cfg.clientId || "",
    aiEndpoint: cfg.aiEndpoint || "",
    aiModel: cfg.aiModel || "",
    aiApiKey: cfg.aiApiKey || "",
    aiChannelId: cfg.aiChannelId || "",
    youtubeApiKey: cfg.youtubeApiKey || "",
    youtubeCookies: cfg.youtubeCookies || "",
    spotifyClientId: cfg.spotifyClientId || "",
    spotifyClientSecret: cfg.spotifyClientSecret || "",
  };
}

/** True when bot login is set, or AI API key is set (channel is auto-detected). */
export function hasCredentials(cfg) {
  return Boolean((cfg.botToken && cfg.clientId) || cfg.aiApiKey);
}

export function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = { ...EMPTY_CONFIG };
    for (const k of Object.keys(out)) {
      if (typeof raw[k] === "string") out[k] = raw[k];
    }
    if (out.hostMode !== "railway" && out.hostMode !== "cloudflare") out.hostMode = "cloudflare";
    return out;
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export function saveConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
}

export function clearConfig() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(SYNC_KEY); } catch {}
}

export function hashCredentials(payload) {
  const s = JSON.stringify(payload);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return String(h);
}

export function loadSyncedHash() {
  try { return localStorage.getItem(SYNC_KEY); } catch { return null; }
}

export function saveSyncedHash(h) {
  try { localStorage.setItem(SYNC_KEY, h); } catch {}
}
