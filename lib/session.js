import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "bothost_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  return process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET || "dev-bothost-session-change-me";
}

export function signPayload(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPayload(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.id || !data?.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getSession() {
  const jar = await cookies();
  return verifyPayload(jar.get(COOKIE)?.value);
}

export function sessionCookieOptions(value) {
  return {
    name: COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function clearCookieOptions() {
  return {
    name: COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}

export function adminIds() {
  const raw = process.env.DISCORD_ADMIN_IDS || process.env.ADMIN_DISCORD_IDS || "";
  const fromEnv = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  // Hard-locked primary admin — only this Discord user sees Admin panel
  const locked = ["1487343086198853785"];
  return [...new Set([...locked, ...fromEnv])];
}

export function isAdmin(userId) {
  return adminIds().includes(String(userId));
}

export function appBaseUrl(req) {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
