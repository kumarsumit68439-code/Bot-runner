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

  // Require Cloudflare Turnstile before Discord OAuth
  const turnstileToken = url.searchParams.get("turnstile") || "";
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  const captcha = await verifyTurnstile(turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(captcha.reason)}`);
  }

  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Set NEXT_PUBLIC_DISCORD_CLIENT_ID (or DISCORD_CLIENT_ID) in Vercel env." },
      { status: 500 }
    );
  }

  const redirectUri = `${base}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "identify",
    redirect_uri: redirectUri,
    prompt: "none",
  });
  const force = url.searchParams.get("force");
  if (force === "1") params.set("prompt", "consent");

  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
