import { NextResponse } from "next/server";
import { appBaseUrl, isAdmin, sessionCookieOptions, signPayload } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discord OAuth callback — ANY Discord user can log in.
 * Admin panel remains gated by DISCORD_ADMIN_IDS / locked admin id in the UI.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  const base = appBaseUrl(req);

  if (err) {
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(err)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/?auth_error=missing_code`);
  }

  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/?auth_error=oauth_not_configured`);
  }

  const redirectUri = `${base}/api/auth/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("token", tokenJson);
      return NextResponse.redirect(`${base}/?auth_error=token_exchange`);
    }

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json();
    if (!me?.id) {
      return NextResponse.redirect(`${base}/?auth_error=user_fetch`);
    }

    // Open login: do NOT block non-admins here. Admin tab is still restricted in the UI.
    const payload = {
      id: me.id,
      username: me.username,
      global_name: me.global_name || me.username,
      avatar: me.avatar,
      banner: me.banner || null,
      accent_color: me.accent_color ?? null,
      provider: "discord",
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const signed = signPayload(payload);
    const opts = sessionCookieOptions(signed);
    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(opts.name, opts.value, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      path: opts.path,
      maxAge: opts.maxAge,
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${base}/?auth_error=server`);
  }
}
