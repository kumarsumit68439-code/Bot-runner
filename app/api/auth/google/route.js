import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/session";
import { supabaseAuthConfig, supabaseAuthConfigured } from "@/lib/supabaseAuth";

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
 * Redirect to Supabase Google OAuth.
 * Enable Google in Supabase → Authentication → Providers.
 * Redirect URL: https://YOUR-DOMAIN/auth/supabase-callback
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

  if (!supabaseAuthConfigured()) {
    return NextResponse.redirect(`${base}/?auth_error=supabase_not_configured`);
  }

  const { url: sbUrl } = supabaseAuthConfig();
  const redirectTo = `${base}/auth/supabase-callback`;
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
  });

  return NextResponse.redirect(`${sbUrl}/auth/v1/authorize?${params}`);
}
