import { NextResponse } from "next/server";
import { appBaseUrl, sessionCookieOptions, signPayload } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function basicAuth(clientId, clientSecret) {
  const raw = `${clientId}:${clientSecret}`;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(raw)));
}

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

  const clientId = (
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
    process.env.SPOTIFY_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
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
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      },
      body,
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("spotify token exchange failed", tokenRes.status, tokenJson);
      const reason =
        tokenJson?.error === "invalid_client"
          ? "oauth_not_configured"
          : "token_exchange";
      return NextResponse.redirect(`${base}/?auth_error=${reason}`);
    }

    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me?.id) {
      console.error("spotify user fetch failed", meRes.status, me);
      return NextResponse.redirect(`${base}/?auth_error=user_fetch`);
    }

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
      username: String(display).slice(0, 64),
      global_name: String(display).slice(0, 64),
      avatar: null,
      banner: null,
      accent_color: null,
      provider: "spotify",
      spotify_id: me.id,
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
    console.error("spotify callback exception", e);
    return NextResponse.redirect(`${base}/?auth_error=server`);
  }
}
