import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/session";

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "captcha_missing_keys" };
  if (!token) return { ok: false, reason: "captcha_required" };

  const body = new URLSearchParams({
    secret,
    response: token,
  });
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

  const clientId =
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
    process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_ID in Vercel env." },
      { status: 500 }
    );
  }

  const redirectUri = `${base}/api/auth/callback/spotify`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-read-email user-read-private",
    show_dialog: "true",
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
}
