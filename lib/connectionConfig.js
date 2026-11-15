const KEY = "botpanel.connection.v1";
const SYNC_KEY = "botpanel.lastSyncedHash.v1";

export const EMPTY_CONFIG = { tunnelUrl: "", authToken: "", botToken: "", clientId: "" };

const PROTOCOL_MAP = { "http:": "ws:", "https:": "wss:", "ws:": "ws:", "wss:": "wss:" };

/**
 * Parses whatever was pasted into the "Cloudflare Tunnel URL" box:
 *   https://x.trycloudflare.com, x.trycloudflare.com, wss://x.trycloudflare.com/,
 *   wss://x.trycloudflare.com/?token=abc ...
 * Returns { empty, base, urlToken, error } where base is "wss://host" (no path, no query, no trailing slash)
 * and urlToken is the ?token= value found in the pasted URL (or "").
 */
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

/**
 * Combines the tunnel box and the Auth Token box into the final WebSocket URL.
 * The typed Auth Token wins; if that box is empty, the ?token= from the pasted URL is used.
 * status: "empty" | "invalid" | "no-token" | "ready"
 */
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

export function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const out = { ...EMPTY_CONFIG };
    for (const k of Object.keys(out)) if (typeof raw[k] === "string") out[k] = raw[k];
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

// Change detection only (not a security hash): lets us skip re-sending + restarting the bot on every page load.
export function hashCredentials(botToken, clientId) {
  const s = `${botToken}\n${clientId}`;
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
