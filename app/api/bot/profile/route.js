import { NextResponse } from "next/server";
import dns from "dns/promises";
import net from "net";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = "https://discord.com/api/v10";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DATA_URI = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
const OK_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("This image link is not allowed.");
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("This image link is not allowed.");
  }
}

/** Download a public image link and return it as a data URI (what Discord's API expects). */
async function urlToDataUri(raw) {
  let current;
  try {
    current = new URL(raw);
  } catch {
    throw new Error("This is not a valid image link.");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(current.protocol)) throw new Error("Only http/https image links are allowed.");
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "BotHostPanel/1.0", Accept: "image/*" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current);
      continue;
    }
    if (!res.ok) throw new Error(`The image link returned HTTP ${res.status}.`);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!OK_TYPES.has(type)) throw new Error("The link is not a PNG, JPG, GIF or WebP image.");
    if (Number(res.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) throw new Error("The image is too large (max 6 MB).");
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_IMAGE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error("The image is too large (max 6 MB).");
      }
      chunks.push(value);
    }
    return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
  }
  throw new Error("Too many redirects on the image link.");
}

/** spec: { type: "data" | "url" | "remove", value? }  ->  undefined (no change) | null (remove) | data URI */
async function resolveImage(spec) {
  if (spec === undefined) return undefined;
  if (!spec || typeof spec !== "object") throw new Error("Invalid image request.");
  if (spec.type === "remove") return null;
  if (spec.type === "data") {
    const v = String(spec.value || "");
    if (v.length > 9 * 1024 * 1024 || !DATA_URI.test(v)) throw new Error("The uploaded file is not a valid PNG, JPG, GIF or WebP image.");
    return v;
  }
  if (spec.type === "url") return urlToDataUri(String(spec.value || "").trim());
  throw new Error("Invalid image request.");
}

function shape(u) {
  const ext = (h) => (String(h).startsWith("a_") ? "gif" : "png");
  return {
    id: u.id,
    username: u.username,
    globalName: u.global_name || null,
    bot: Boolean(u.bot),
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext(u.avatar)}?size=256` : null,
    bannerUrl: u.banner ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${ext(u.banner)}?size=600` : null,
    accentColor: typeof u.accent_color === "number" ? `#${u.accent_color.toString(16).padStart(6, "0")}` : null,
  };
}

async function discordMe(method, token, body) {
  const res = await fetch(`${API}/users/@me`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (bothost-panel, 1.0)",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { res, json };
}

/** How many servers the bot is in (0 = not invited anywhere yet). null = could not be checked. */
async function guildCount(token) {
  try {
    const res = await fetch(`${API}/users/@me/guilds?limit=200`, {
      headers: { Authorization: `Bot ${token}`, "User-Agent": "DiscordBot (bothost-panel, 1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const list = await res.json();
    return Array.isArray(list) ? list.length : null;
  } catch {
    return null;
  }
}

function discordError(res, json) {
  if (res.status === 401) return "Discord rejected the bot token. Check the Bot Token you saved.";
  if (res.status === 429) {
    const s = Math.ceil(Number(json?.retry_after) || 0);
    return `Discord rate limit: you are changing the profile too fast.${s ? ` Try again in ${s}s.` : " Try again later."}`;
  }
  const nested = json?.errors && Object.values(json.errors).map((e) => e?._errors?.[0]?.message).find(Boolean);
  return nested || json?.message || `Discord returned HTTP ${res.status}.`;
}

/**
 * POST { botToken, avatar?, banner? }
 *  - no avatar/banner  -> returns the bot's current public profile
 *  - avatar/banner set -> updates the bot profile on Discord, then returns it
 * The profile also carries guildCount (how many servers the bot is in).
 * The bot token is only used for the calls to Discord. It is never logged or returned.
 */
export async function POST(req) {
  const session = await getSession();
  if (!session) return fail("Not signed in.", 401);

  let body;
  try { body = await req.json(); } catch { return fail("Invalid request."); }

  const token = String(body?.botToken || "").trim();
  if (token.length < 20 || token.length > 250 || /\s/.test(token)) return fail("Bot token is missing or invalid.");

  try {
    const patch = {};
    const avatar = await resolveImage(body.avatar);
    const banner = await resolveImage(body.banner);
    if (avatar !== undefined) patch.avatar = avatar;
    if (banner !== undefined) patch.banner = banner;

    const { res, json } = Object.keys(patch).length
      ? await discordMe("PATCH", token, patch)
      : await discordMe("GET", token);
    if (!res.ok || !json?.id) return fail(discordError(res, json), res.status === 429 ? 429 : res.status === 401 ? 401 : 400);
    return NextResponse.json({ profile: { ...shape(json), guildCount: await guildCount(token) } });
  } catch (e) {
    return fail(e?.message || "Something went wrong.");
  }
}
