const KEY = "botpanel.connection.v1";
const SYNC_KEY = "botpanel.lastSyncedHash.v1";

export const EMPTY_CONFIG = { tunnelUrl: "", authToken: "", botToken: "", clientId: "" };

/**
 * Accepts "https://x.trycloudflare.com", "x.trycloudflare.com", "wss://x.trycloudflare.com/anything?token=.."
 * and returns "wss://x.trycloudflare.com". Returns "" for empty input and null for invalid input.
 */
export function normalizeTunnelUrl(input) {
  let v = String(input ?? "").trim();
  if (!v) return "";
  v = v.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
  if (!/^wss?:\/\//i.test(v)) v = "wss://" + v;
  try {
    const u = new URL(v);
    if (!u.host) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function buildWsUrl(tunnelUrl, authToken) {
  const base = normalizeTunnelUrl(tunnelUrl);
  const token = String(authToken ?? "").trim();
  if (!base || !token) return null;
  return `${base}/?token=${encodeURIComponent(token)}`;
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
