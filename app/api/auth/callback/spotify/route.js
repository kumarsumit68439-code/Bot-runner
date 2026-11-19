import { NextResponse } from "next/server";
import { appBaseUrl, sessionCookieOptions, signPayload } from "@/lib/session";

/**
 * Spotify OAuth callback for panel login.
 * Note: Discord remains the primary admin gate (DISCORD_ADMIN_IDS).
 * Spotify login creates a session tagged with provider "spotify".
 * If you only want Discord admins, keep using Continue with Discord.
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

  const clientId =
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/?auth_error=oauth_not_configured`);
  }

  const redirectUri = `${base}/api/auth/callback/spotify`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body,
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("spotify token", tokenJson);
      return NextResponse.redirect(`${base}/?auth_error=token_exchange`);
    }

    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json();
    if (!me?.id) {
      return NextResponse.redirect(`${base}/?auth_error=user_fetch`);
    }

    // Optional allow-list: SPOTIFY_ADMIN_IDS=comma,separated,spotify,user,ids
    const allow = String(process.env.SPOTIFY_ADMIN_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allow.length && !allow.includes(me.id)) {
      return NextResponse.redirect(`${base}/?auth_error=not_admin`);
    }

    const display =
      me.display_name ||
      (me.email ? String(me.email).split("@")[0] : null) ||
      me.id;

    const payload = {
      id: `spotify:${me.id}`,
      username: display,
      global_name: display,
      avatar: me.images?.[0]?.url || null,
      banner: null,
      accent_color: null,
      provider: "spotify",
      spotify_id: me.id,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const cookie = sessionCookieOptions(signPayload(payload));
    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(cookie);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${base}/?auth_error=server`);
  }
}
