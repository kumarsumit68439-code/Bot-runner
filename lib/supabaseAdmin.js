/**
 * Server-only Supabase REST helper (service role).
 * Never import this from client components.
 *
 * Values are encrypted (AES-256-GCM) before they are stored in the panel_secrets table, and decrypted
 * when read back. Key: ENV_ENCRYPTION_KEY, else SESSION_SECRET, else DISCORD_CLIENT_SECRET.
 * Set ENV_ENCRYPTION_KEY on Vercel to a long random string so rotating other secrets never locks you out.
 */
import crypto from "crypto";

function config() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

export function supabaseConfigured() {
  const { url, key } = config();
  return Boolean(url && key);
}

// ---------- encryption ----------
const ENC_PREFIX = "enc:v1:";

function encKey() {
  const raw = process.env.ENV_ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET || "";
  return raw ? crypto.createHash("sha256").update(`bothost-secrets:${raw}`).digest() : null;
}

function encryptValue(plain) {
  const key = encKey();
  const text = String(plain ?? "");
  if (!key) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ENC_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** -> { value, ok }. ok=false means the value is encrypted but cannot be decrypted with the current key. */
function decryptValue(stored) {
  const s = String(stored ?? "");
  if (!s.startsWith(ENC_PREFIX)) return { value: s, ok: true };
  const key = encKey();
  if (!key) return { value: "", ok: false };
  try {
    const buf = Buffer.from(s.slice(ENC_PREFIX.length), "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    return { value: plain, ok: true };
  } catch {
    return { value: "", ok: false };
  }
}

// ---------- errors ----------
function explain(what, status, text) {
  const t = String(text || "");
  if (/panel_secrets/.test(t) && /does not exist|schema cache|PGRST205|42P01/.test(t)) {
    return new Error("The panel_secrets table does not exist in Supabase yet. Run the setup SQL in the Supabase SQL Editor.");
  }
  if (status === 401 || status === 403) {
    return new Error("Supabase rejected the service key. Check SUPABASE_SERVICE_ROLE_KEY on Vercel.");
  }
  return new Error(`Supabase ${what} failed: ${status} ${t.slice(0, 160)}`);
}

function headers(extra) {
  const { key } = config();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// ---------- queries ----------
export async function secretsList(ownerDiscordId) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    select: "key,updated_at",
    owner_discord_id: `eq.${ownerDiscordId}`,
    order: "key.asc",
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw explain("list", r.status, await r.text());
  return r.json();
}

/** Every saved variable with its decrypted value (owner only). */
export async function secretsAll(ownerDiscordId) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    select: "key,value,updated_at",
    owner_discord_id: `eq.${ownerDiscordId}`,
    order: "key.asc",
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw explain("read", r.status, await r.text());
  const rows = await r.json();
  return rows.map((row) => {
    const d = decryptValue(row.value);
    return { key: row.key, value: d.value, updated_at: row.updated_at, unreadable: !d.ok };
  });
}

export async function secretsGet(ownerDiscordId, keyName) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    select: "key,value,updated_at",
    owner_discord_id: `eq.${ownerDiscordId}`,
    key: `eq.${keyName}`,
    limit: "1",
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, { headers: headers(), cache: "no-store" });
  if (!r.ok) throw explain("get", r.status, await r.text());
  const rows = await r.json();
  if (!rows[0]) return null;
  const d = decryptValue(rows[0].value);
  return { key: rows[0].key, value: d.value, updated_at: rows[0].updated_at, unreadable: !d.ok };
}

export async function secretsUpsert(ownerDiscordId, keyName, value) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const r = await fetch(`${url}/rest/v1/panel_secrets?on_conflict=owner_discord_id,key`, {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      owner_discord_id: ownerDiscordId,
      key: keyName,
      value: encryptValue(value),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw explain("upsert", r.status, await r.text());
  return true;
}

/** Make the stored variables exactly `items` ([{key, value}]): upsert all of them, delete the rest. */
export async function secretsReplaceAll(ownerDiscordId, items) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");

  const existing = await secretsList(ownerDiscordId);

  if (items.length) {
    const now = new Date().toISOString();
    const r = await fetch(`${url}/rest/v1/panel_secrets?on_conflict=owner_discord_id,key`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(
        items.map((i) => ({
          owner_discord_id: ownerDiscordId,
          key: i.key,
          value: encryptValue(i.value),
          updated_at: now,
        }))
      ),
    });
    if (!r.ok) throw explain("save", r.status, await r.text());
  }

  const keep = new Set(items.map((i) => i.key));
  const stale = existing.map((e) => e.key).filter((k) => !keep.has(k));
  if (stale.length) {
    // keys are validated (letters/digits/underscore) before they get here
    const list = stale.map((k) => `"${k}"`).join(",");
    const q = new URLSearchParams({ owner_discord_id: `eq.${ownerDiscordId}`, key: `in.(${list})` });
    const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, { method: "DELETE", headers: headers() });
    if (!r.ok) throw explain("delete", r.status, await r.text());
  }
  return true;
}

export async function secretsDelete(ownerDiscordId, keyName) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    owner_discord_id: `eq.${ownerDiscordId}`,
    key: `eq.${keyName}`,
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, { method: "DELETE", headers: headers() });
  if (!r.ok) throw explain("delete", r.status, await r.text());
  return true;
}
