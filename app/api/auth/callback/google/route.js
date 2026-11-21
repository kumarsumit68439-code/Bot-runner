import { NextResponse } from "next/server";
import { appBaseUrl, sessionCookieOptions, signPayload } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/?auth_error=oauth_not_configured`);
  }

  const redirectUri = `${base}/api/auth/callback/google`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("google token", tokenRes.status, tokenJson);
      return NextResponse.redirect(`${base}/?auth_error=token_exchange`);
    }

    const meRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      cache: "no-store",
    });
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me?.sub) {
      console.error("google userinfo", meRes.status, me);
      return NextResponse.redirect(`${base}/?auth_error=user_fetch`);
    }

    const display =
      me.name ||
      me.given_name ||
      (me.email ? String(me.email).split("@")[0] : null) ||
      me.sub;

    const payload = {
      id: `google:${me.sub}`,
      username: String(display).slice(0, 64),
      global_name: String(display).slice(0, 64),
      avatar: typeof me.picture === "string" && me.picture.length < 300 ? me.picture : null,
      banner: null,
      accent_color: null,
      provider: "google",
      google_id: me.sub,
      email: me.email || null,
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
    console.error("google callback", e);
    return NextResponse.redirect(`${base}/?auth_error=server`);
  }
}
