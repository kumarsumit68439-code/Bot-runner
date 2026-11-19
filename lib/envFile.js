// Shared helpers for the bot's .env text format (used by the Environment tab and the auto-sync hook).

export const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const SECRET_HINTS = new Set([
  "BOT_TOKEN",
  "DISCORD_TOKEN",
  "TOKEN",
  "AI_API_KEY",
  "API_KEY",
  "YOUTUBE_API_KEY",
  "YOUTUBE_COOKIES",
  "AUTH_TOKEN",
  "PASSWORD",
  "SECRET",
  "COOKIE",
  "COOKIES",
]);

export function isSecretKey(key) {
  const k = String(key || "").toUpperCase();
  if (SECRET_HINTS.has(k)) return true;
  return /TOKEN|SECRET|PASSWORD|KEY|COOKIE|AUTH/.test(k);
}

export function parseEnv(text) {
  const rows = [];
  if (!text || !String(text).trim()) return rows;
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY_RE.test(key)) continue;
    let value = line.slice(eq + 1);
    if (value.startsWith('"')) {
      let body = value.slice(1);
      if (body.endsWith('"') && !body.slice(0, -1).endsWith("\\")) {
        value = body.slice(0, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      } else {
        const parts = [body];
        while (i < lines.length) {
          const next = lines[i];
          i += 1;
          if (next.endsWith('"') && !next.endsWith('\\"')) {
            parts.push(next.slice(0, -1));
            break;
          }
          parts.push(next);
        }
        value = parts.join("\n").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    rows.push({
      id: `env-${key}-${rows.length}`,
      key,
      value,
      secret: isSecretKey(key),
      multiline: value.includes("\n") || key === "YOUTUBE_COOKIES",
      reveal: false,
    });
  }
  return rows;
}

export function serializeEnv(rows) {
  const lines = [
    "# BotHost environment — edited from the panel Environment tab",
    "# Do not commit secrets. Bot loads these via dotenv on start.",
    "",
  ];
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key || !KEY_RE.test(key)) continue;
    const value = row.value == null ? "" : String(row.value);
    const needsQuote =
      value.includes("\n") ||
      value.includes("#") ||
      value.includes(" ") ||
      value.includes('"') ||
      value.includes("'") ||
      value.startsWith(" ") ||
      value.endsWith(" ");
    if (needsQuote) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ---- "Which Supabase version was last pushed to the daemon" (per browser) ----
const APPLIED_KEY = "botpanel.envApplied.v1";

export function hashEnvItems(items) {
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const s = JSON.stringify(sorted.map((i) => [i.key, i.value]));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return String(h);
}

export function getAppliedHash() {
  try { return localStorage.getItem(APPLIED_KEY); } catch { return null; }
}

export function setAppliedHash(h) {
  try { localStorage.setItem(APPLIED_KEY, h); } catch {}
}
