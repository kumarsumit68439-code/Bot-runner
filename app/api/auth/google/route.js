import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "captcha_missing_keys" };
  if (!token) return { ok: false, reason: "captcha_required" };
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = await r.json();
    if (!j?.success) return { ok: false, reason: "captcha_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "captcha_failed" };
  }
}

/**
 * Direct Google OAuth (no Supabase redirect).
 * Env: NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID
 * Google Cloud Console redirect URI:
 *   https://YOUR-DOMAIN/api/auth/callback/google
 */
export async function GET(req) {
  const url = new URL(req.url);
  const base = appBaseUrl(req);

  const turnstileToken = url.searchParams.get("turnstile") || "";
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  const captcha = await verifyTurnstile(turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(captcha.reason)}`);
  }

  const clientId = (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  if (!clientId) {
    return NextResponse.redirect(`${base}/?auth_error=oauth_not_configured`);
  }

  const redirectUri = `${base}/api/auth/callback/google`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
