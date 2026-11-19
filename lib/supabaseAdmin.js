/**
 * Server-only Supabase REST helper (service role).
 * Never import this from client components.
 */

function config() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

export function supabaseConfigured() {
  const { url, key } = config();
  return Boolean(url && key);
}

export async function secretsList(ownerDiscordId) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    select: "key,updated_at",
    owner_discord_id: `eq.${ownerDiscordId}`,
    order: "key.asc",
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Supabase list failed: ${r.status}`);
  return r.json();
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
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Supabase get failed: ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

export async function secretsUpsert(ownerDiscordId, keyName, value) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const r = await fetch(`${url}/rest/v1/panel_secrets`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      owner_discord_id: ownerDiscordId,
      key: keyName,
      value: String(value ?? ""),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase upsert failed: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

export async function secretsDelete(ownerDiscordId, keyName) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase not configured");
  const q = new URLSearchParams({
    owner_discord_id: `eq.${ownerDiscordId}`,
    key: `eq.${keyName}`,
  });
  const r = await fetch(`${url}/rest/v1/panel_secrets?${q}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase delete failed: ${r.status}`);
  return true;
}
